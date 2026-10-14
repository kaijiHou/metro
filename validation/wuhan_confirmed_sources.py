"""Rebuild the confirmed-station supplement; never change the city snapshots.

Station orders and official sources are recorded in docs/WUHAN_PLANNING.md.
Public POI coordinates are GCJ-02; icauto's BMapGL.Point values are BD-09.
"""
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('transit_refresh', ROOT / 'scripts/update-transit.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
base = json.loads((ROOT / 'public/transit/wuhan.json').read_text(encoding='utf-8'))['project']

ring = '钢都花园 园林路 团结大道 汪家墩 秦园中路 公正路 何家垅 十五中 武昌站东广场 瑞安街东 富安街 楚祥大道 省农科院南 光霞 市农科院 夹套河 国博中心南 国博新城 四新南路 四新中路 芳草路 港口村 墨水湖公园 十里铺 汉钢 汉西路南 双墩 汉西路北 华安里 汉口站北广场 石桥 中一路 后湖四路 兴业路 百步亭 丹水池 科普公园'.split()
eleven = '江安路 江国路 国博中心北 梅林 芳草路 四新大道 汤山 汉阳站'.split()
ten = '汉口火车站 唐家墩 竹叶山 二七小路 二七路 余家头 钢都花园 工业路 北洋桥 武汉火车站 铁铺岭 万家咀 白玉山'.split()

# name: longitude, latitude, public POI ID
gcj = {
    '汉西路南': (114.237049, 30.577333, 'BV09416844'),
    '汉西路北': (114.227951, 30.600305, 'BV09416842'),
    '华安里': (114.236996, 30.614054, 'BV09357636'),
    '汉口站北广场': (114.255198, 30.621419, 'BV09357626'),
    '后湖四路': (114.295383, 30.637774, 'BV10879671'),
    '百步亭': (114.317726, 30.648217, 'BV10879673'),
    '汉阳站': (114.154357, 30.550144, 'BV09160179'),
    '北洋桥': (114.407143, 30.602602, 'BV11649484'),
    '铁铺岭': (114.439253, 30.600597, 'BV11310957'),
    '白玉山': (114.494379, 30.602984, 'BV11649482'),
}
# Public map locations, not surveyed engineering center coordinates.
bd = {
    '汉钢': (114.24024280232, 30.571606994603, 14416),
    '汤山': (114.187508496, 30.547217791127, 14573),
    '梅林': (114.22617614651, 30.525042579894, 14576),
    '江国路': (114.28854163535, 30.50800216442, 14578),
    '工业路': (114.39366224443, 30.62538989106, 14494),
    '万家咀': (114.47907726453, 30.603172427124, 14532),
}

def bd_to_gcj(lng, lat):
    x, y = lng - .0065, lat - .006
    z = math.sqrt(x*x + y*y) - .00002 * math.sin(y * math.pi * 3000 / 180)
    theta = math.atan2(y, x) - .000003 * math.cos(x * math.pi * 3000 / 180)
    return z * math.cos(theta), z * math.sin(theta)

stations = {}
for name in dict.fromkeys(ring + eleven + ten):
    existing = next((s for s in base['stations'].values() if s['name'] == name), None)
    if existing:
        stations[name] = dict(existing, coordinateSource='public/transit/wuhan.json')
    else:
        if name in gcj:
            lng, lat, poi = gcj[name]
            point = refresh.gcj_to_wgs(lng, lat)
            source = f'https://www.amap.com/place/{poi}'
        else:
            lng, lat, page = bd[name]
            point = refresh.gcj_to_wgs(*bd_to_gcj(lng, lat))
            source = f'https://www.icauto.com.cn/chuxing/d_{page}.html'
        stations[name] = {'id': f'wuhan-confirmed-station-{name}', 'name': name, 'lng': point[0], 'lat': point[1], 'coordinateSource': source}
result = {'ring': ring, 'eleven': eleven, 'ten': ten, 'stations': stations}
(ROOT / 'src/utils/wuhanConfirmedData.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
assert len(ring) == 37 and len(ten) == 13 and len(eleven) == 8
print(f'Confirmed supplement: {len(stations)} named stations, 37-stop ring, 13-stop Line 10, 8-stop Line 11 extension.')
