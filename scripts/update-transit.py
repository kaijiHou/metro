"""Refresh the city catalogue and editable rail snapshots from the live subway service."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'transit'
CACHE = ROOT / 'validation' / 'transit-source'
BASE = 'https://map.amap.com/service/subway?srhdata='
ALIASES = {'hangzhou': ['海宁'], 'suzhou': ['昆山'], 'xian': ['咸阳'], 'taibei': ['新北', '臺北', '新北市'], 'taizhong': ['臺中'], 'gaoxiong': ['高雄'], 'taoyuan': ['桃園']}


def gcj_to_wgs(lng, lat):
    """Invert the standard GCJ-02 offset by iteration; input here is mainland/HK/MO only."""
    def offset(x, y):
        a, ee = 6378245.0, 0.00669342162296594323
        px, py = x - 105, y - 35
        dlat = -100 + 2*px + 3*py + .2*py*py + .1*px*py + .2*math.sqrt(abs(px))
        dlng = 300 + px + 2*py + .1*px*px + .1*px*py + .1*math.sqrt(abs(px))
        shared = (20*math.sin(6*px*math.pi) + 20*math.sin(2*px*math.pi))*2/3
        dlat += shared + (20*math.sin(py*math.pi)+40*math.sin(py/3*math.pi))*2/3 + (160*math.sin(py/12*math.pi)+320*math.sin(py*math.pi/30))*2/3
        dlng += shared + (20*math.sin(px*math.pi)+40*math.sin(px/3*math.pi))*2/3 + (150*math.sin(px/12*math.pi)+300*math.sin(px/30*math.pi))*2/3
        rad = y / 180 * math.pi
        magic = 1 - ee * math.sin(rad)**2
        root = math.sqrt(magic)
        return dlng*180/(a/root*math.cos(rad)*math.pi), dlat*180/((a*(1-ee))/(magic*root)*math.pi)
    x, y = lng, lat
    for _ in range(4):
        dx, dy = offset(x, y)
        x, y = lng-dx, lat-dy
    return round(x, 6), round(y, 6)


def download(filename):
    url = BASE + filename
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://map.amap.com/subway/index.html'})
            with urllib.request.urlopen(request, timeout=35) as response:
                raw = response.read()
            data = json.loads(raw)
            (CACHE / filename).write_bytes(raw)
            return data, hashlib.sha256(raw).hexdigest(), url
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 + attempt)


def convert(city, data):
    code, spell = city['adcode'], city['spell']
    name = city['cityname'].removesuffix('特别行政区').removesuffix('市')
    project = {'version': 2, 'cityId': spell, 'name': name+'地铁规划', 'stations': {}, 'waypoints': {}, 'lines': {}}
    excluded = []
    for index, line in enumerate(data['l']):
        label = line.get('ln', '').strip()
        if line.get('su') != '1' or re.search('缆车|索道', label):
            excluded.append(label)
            continue
        sequence = []
        for station in line['st']:
            if station.get('su') != '1':
                excluded.append(label+':'+station['n'])
                continue
            lng, lat = map(float, station['sl'].split(','))
            if not math.isfinite(lng) or not math.isfinite(lat) or not (-180 <= lng <= 180 and -90 <= lat <= 90) or (lng == 0 and lat == 0):
                raise ValueError(f"{name}/{label}/{station['n']}: invalid coordinates")
            if not code.startswith('71'):
                lng, lat = gcj_to_wgs(lng, lat)
            sid = 'amap-'+code+'-'+(station.get('poiid') or station['si'])
            project['stations'].setdefault(sid, {'id': sid, 'name': station['n'], 'lng': lng, 'lat': lat})
            if not sequence or sequence[-1] != sid:
                sequence.append(sid)
        if len(sequence) < 2:
            raise ValueError(f'{name}/{label}: fewer than two open stations')
        closed = line.get('lo') == '1'
        if sequence[0] == sequence[-1]:
            sequence.pop()
            closed = True
        # A route may revisit a junction (e.g. airport loop). Split the returning edge,
        # keeping shared station IDs rather than inventing a second interchange station.
        parts = [[]]
        for sid in sequence:
            if sid in parts[-1]:
                parts.append([parts[-1][-1], sid])
            else:
                parts[-1].append(sid)
        for part_index, part in enumerate(parts):
            lid = f'amap-{code}-{line.get("ls") or index}-{part_index}'
            if lid in project['lines']:
                lid += f'-{index}'
            color = '#'+line['cl'].lstrip('#')
            if not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
                raise ValueError(f'{name}/{label}: invalid color')
            record = {'id': lid, 'name': label + (f'（支段 {part_index+1}）' if len(parts)>1 else ''), 'color': color, 'nodes': [{'type': 'station', 'id': sid} for sid in part]}
            if closed and len(parts) == 1:
                record['closed'] = True
            project['lines'][lid] = record
    if not project['lines']:
        raise ValueError(f'{name}: no open lines')
    return name, project, excluded


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')


def refresh_city(city):
    data, digest, url = download(f"{city['adcode']}_drw_{city['spell']}.json")
    name, project, excluded = convert(city, data)
    stations = list(project['stations'].values())
    west, east = min(s['lng'] for s in stations), max(s['lng'] for s in stations)
    south, north = min(s['lat'] for s in stations), max(s['lat'] for s in stations)
    acquired = datetime.fromtimestamp((CACHE / f"{city['adcode']}_drw_{city['spell']}.json").stat().st_mtime, timezone.utc).isoformat(timespec='seconds')
    metadata = {'id': city['spell'], 'name': name, 'aliases': ALIASES.get(city['spell'], []), 'center': [round((west+east)/2, 6), round((south+north)/2, 6)], 'bounds': [[west,south],[east,north]], 'lineCount': len(project['lines']), 'stationCount': len(stations), 'retrievedAt': acquired, 'sourceName': '高德地图地铁图', 'sourceUrl': url, 'sourceSha256': digest, 'excluded': excluded}
    print(f"{name}: {metadata['lineCount']} lines, {len(stations)} stations", flush=True)
    time.sleep(.3)
    return {'city': metadata, 'project': project}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cached', action='store_true', help='Reconvert already downloaded raw responses without network access')
    args = parser.parse_args()
    if args.cached:
        global download
        def download(filename):
            raw = (CACHE / filename).read_bytes()
            return json.loads(raw), hashlib.sha256(raw).hexdigest(), BASE+filename
    listing, digest, url = download('citylist.json')
    with ThreadPoolExecutor(max_workers=2) as pool:
        snapshots = list(pool.map(refresh_city, listing['citylist']))
    cities = [snapshot['city'] for snapshot in snapshots]
    for snapshot in snapshots:
        write_json(OUTPUT / (snapshot['city']['id']+'.json'), snapshot)
    acquired = datetime.fromtimestamp((CACHE / 'citylist.json').stat().st_mtime, timezone.utc).isoformat(timespec='seconds')
    write_json(OUTPUT / 'catalog.json', {'retrievedAt': acquired, 'sourceUrl': url, 'sourceSha256': digest, 'cities': cities})
    print(f'Complete: {len(cities)} city networks', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
