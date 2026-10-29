import sys, json, base64
import numpy as np, eccodes
src, out = sys.argv[1], sys.argv[2]
fields = {}
with open(src, 'rb') as f:
    while True:
        h = eccodes.codes_grib_new_from_file(f)
        if h is None: break
        key = (eccodes.codes_get(h, 'shortName'), eccodes.codes_get(h, 'typeOfLevel'), eccodes.codes_get(h, 'level'))
        ni, nj = eccodes.codes_get(h, 'Ni'), eccodes.codes_get(h, 'Nj')
        meta = dict(lo1=eccodes.codes_get(h,'longitudeOfFirstGridPointInDegrees'), la1=eccodes.codes_get(h,'latitudeOfFirstGridPointInDegrees'),
                    dx=eccodes.codes_get(h,'iDirectionIncrementInDegrees'), dy=eccodes.codes_get(h,'jDirectionIncrementInDegrees'),
                    ni=ni, nj=nj, date=eccodes.codes_get(h,'dataDate'), time=eccodes.codes_get(h,'dataTime'), step=eccodes.codes_get(h,'step'))
        vals = eccodes.codes_get_values(h).reshape(nj, ni)
        fields[key] = (vals, meta)
        eccodes.codes_release(h)
print({k: (v[1]['ni'], v[1]['nj'], round(float(v[0].min()),1), round(float(v[0].max()),1)) for k, v in fields.items()})
def pick(name):
    for k, v in fields.items():
        if k[0] == name: return v
    raise SystemExit('missing ' + name)
u, meta = pick('10u'); v, _ = pick('10v'); t, _ = pick('2t'); p, _ = pick('prmsl')
def enc(a, scale, offset=0):
    q = np.clip(np.round((a - offset) * scale), -32768, 32767).astype('<i2')
    return base64.b64encode(q.tobytes()).decode()
doc = dict(meta=meta, source='GFS 1.0 deg analysis (NOAA/NCEP), f000',
           u=enc(u, 10), v=enc(v, 10), t=enc(t, 10, 200), p=enc(p, 0.1),
           scale=dict(u=[10,0], v=[10,0], t=[10,200], p=[0.1,0]))
json.dump(doc, open(out, 'w'))
print('meta', meta, 'bytes', len(json.dumps(doc)))
# sanity: wind speed max near Arnab remnant (19N 82E) and IN-FA (15.9N 154.6E)
lo1, la1, dx = meta['lo1'], meta['la1'], meta['dx']
def at(lat, lon):
    j = int(round((la1 - lat) / meta['dy'])); i = int(round(((lon - lo1) % 360) / dx))
    return float(np.hypot(u[j, i], v[j, i])), float(p[j, i]) / 100
for name, la, lo in [('Arnab', 19.0, 82.1), ('IN-FA', 15.9, 154.6), ('Vance', 20.7, -108.4)]:
    best = max(((np.hypot(u[j, i], v[j, i]), j, i) for j in range(int((la1-la-4)/dx), int((la1-la+4)/dx)) for i in [int(((lo-lo1)%360)/dx)+k for k in range(-4,5)]), key=lambda x: x[0])
    print(name, 'center wind m/s,hPa', at(la, lo), 'max wind within 4deg m/s', round(float(best[0]), 1))
