import sys, re, json
import xml.etree.ElementTree as ET
spike, out = sys.argv[1], sys.argv[2]

def text(path):
    t = open(path, errors='ignore').read()
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', t, flags=re.S)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t))

def cira(path):
    t = text(path)
    hist = t[t.find('Track History Synoptic Time'):]
    hist = hist[:hist.find('About Track History')]
    track = [dict(t=f'{d}T{h}:00Z', lat=float(la), lon=float(lo), kt=int(k))
             for d, h, la, lo, k in re.findall(r'(\d{4}-\d\d-\d\d) (\d\d:\d\d) (-?[\d.]+) (-?[\d.]+) (\d+)', hist)]
    track.sort(key=lambda p: p['t'])
    fc = t[t.find('Forecast Track Time of Latest Forecast'):]
    issued = re.search(r'Latest Forecast: (\d{4}-\d\d-\d\d) (\d\d:\d\d)', fc)
    fc = fc[:fc.find('Forecast Track Archive')]
    rows = [dict(h=int(h), lat=float(la), lon=float(lo), kt=int(k))
            for h, la, lo, k in re.findall(r'(\d+) (-?[\d.]+) (-?[\d.]+) (\d+)', fc.split('Intensity', 1)[1])]
    rows = [r for r in rows if not (r['lat'] == 0 and r['lon'] == 0)]
    label = re.search(r'TC Realtime (\w+) - (.+?) RAMMB', t)
    import html
    lab = html.unescape(label.group(2)).rsplit(' ', 1)[0] if label else ''
    return track, rows, (f'{issued.group(1)}T{issued.group(2)}:00Z' if issued else None), lab

def atcf_ll(s):
    v = int(s[:-1]) / 10
    return -v if s[-1] in 'SW' else v

def nhc(btk, fst):
    seen = {}
    for line in open(btk):
        c = [x.strip() for x in line.split(',')]
        ts = c[2]; seen[ts] = dict(t=f'{ts[:4]}-{ts[4:6]}-{ts[6:8]}T{ts[8:10]}:00:00Z', lat=atcf_ll(c[6]), lon=atcf_ll(c[7]), kt=int(c[8]), hpa=int(c[9]) or None)
        name = c[27] if len(c) > 27 else ''
    track = [seen[k] for k in sorted(seen)]
    fcs, issued = {}, None
    for line in open(fst):
        c = [x.strip() for x in line.split(',')]
        issued = f'{c[2][:4]}-{c[2][4:6]}-{c[2][6:8]}T{c[2][8:10]}:00:00Z'
        fcs[int(c[5])] = dict(h=int(c[5]), lat=atcf_ll(c[6]), lon=atcf_ll(c[7]), kt=int(c[8]))
    return track, [fcs[k] for k in sorted(fcs)], issued, name

people = {}
r = ET.parse(f'{spike}/gdacs/rss.xml').getroot(); ns = {'gdacs': 'http://www.gdacs.org'}
for it in r.findall('.//item'):
    if it.findtext('gdacs:eventtype', namespaces=ns) != 'TC': continue
    pop = it.find('gdacs:population', ns)
    people[it.findtext('gdacs:eventname', namespaces=ns).rsplit('-', 1)[0]] = dict(
        count=int(float(pop.attrib.get('value', 0))) if pop is not None else 0,
        alert=it.findtext('gdacs:alertlevel', namespaces=ns), modified=it.findtext('gdacs:datemodified', namespaces=ns))

storms = []
for sid, name, kind, basin, official, f in [
    ('io022026', 'Arnab', 'cyclone', 'Bay of Bengal', ['IMD (India Meteorological Department)', 'https://mausam.imd.gov.in/'], 'cira/io022026.html'),
    ('wp302026', 'In-fa', 'typhoon', 'Western Pacific', ['JMA (Japan Meteorological Agency)', 'https://www.jma.go.jp/bosai/map.html#contents=typhoon&lang=en'], 'cira/wp302026.html'),
    ('io912026', 'Invest 91B', 'disturbance', 'Andaman Sea', ['IMD (India Meteorological Department)', 'https://mausam.imd.gov.in/'], 'cira/io912026.html')]:
    track, fc, issued, label = cira(f'{spike}/{f}')
    storms.append(dict(id=sid, name=name, kind=kind, basin=basin, track=track, forecast=fc, forecastIssued=issued,
                       sourceLabel=label, source='JTWC via CIRA RAMMB', sourceUrl=f'https://rammb-data.cira.colostate.edu/tc_realtime/storm.asp?storm_identifier={sid}',
                       official=official, people=people.get(name.upper().replace('INVEST 91B', 'X')), windAvg='1-minute'))
track, fc, issued, nm = nhc(f'{spike}/nhc/vance.btk', f'{spike}/nhc/vance.fst')
storms.append(dict(id='ep222026', name='Vance', kind='hurricane-basin', basin='Eastern Pacific', track=track, forecast=fc, forecastIssued=issued,
                   sourceLabel='Tropical Depression', source='NHC (US National Hurricane Center)', sourceUrl='https://www.nhc.noaa.gov/',
                   official=['NHC (US National Hurricane Center)', 'https://www.nhc.noaa.gov/'], people=people.get('VANCE'), windAvg='1-minute'))
for s in storms:
    print(s['name'], len(s['track']), 'pts', s['track'][0]['t'], '->', s['track'][-1]['t'], s['track'][-1], '| fc', len(s['forecast']), s['forecastIssued'], '| people', s['people'], '|', s['sourceLabel'])
json.dump(dict(snapshot='2026-10-29T00:00:00Z', fetchedAt='2026-10-29T06:10:00Z', storms=storms), open(out, 'w'), indent=1)
