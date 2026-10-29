import sys, csv, json
src, out = sys.argv[1], sys.argv[2]
rows = list(csv.reader(open(src, errors='ignore')))
h = rows[0]; ix = {k: h.index(k) for k in ['SID', 'SEASON', 'NAME', 'ISO_TIME', 'LAT', 'LON', 'USA_WIND', 'WMO_WIND', 'USA_PRES', 'WMO_PRES']}
want = {('FANI', '2019'): 'Bay of Bengal', ('AMPHAN', '2020'): 'Bay of Bengal', ('DANA', '2024'): 'Bay of Bengal', ('PHAILIN', '2013'): 'Bay of Bengal'}
storms = {}
for r in rows[2:]:
    key = (r[ix['NAME']], r[ix['SEASON']])
    if key not in want: continue
    t = r[ix['ISO_TIME']]
    if t[11:13] not in ('00', '06', '12', '18') or t[14:16] != '00': continue
    wind = r[ix['USA_WIND']].strip() or r[ix['WMO_WIND']].strip()
    if not wind: continue
    pres = r[ix['USA_PRES']].strip() or r[ix['WMO_PRES']].strip()
    s = storms.setdefault(key, dict(id=r[ix['SID']], name=key[0].title(), year=int(key[1]), basin=want[key], track=[]))
    s['track'].append(dict(t=t.replace(' ', 'T') + 'Z', lat=float(r[ix['LAT']]), lon=float(r[ix['LON']]), kt=int(float(wind)), hpa=int(float(pres)) if pres else None))
res = []
for k, s in storms.items():
    pk = max(s['track'], key=lambda p: p['kt'])
    print(s['name'], s['year'], len(s['track']), 'pts, peak', pk['kt'], 'kt at', pk['t'])
    res.append(s)
res.sort(key=lambda s: -s['year'])
json.dump(dict(source='IBTrACS v04r01 (NOAA NCEI), USA_WIND (JTWC 1-minute) where present', storms=res), open(out, 'w'))
