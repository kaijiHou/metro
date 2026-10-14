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
extensions = [
    {'id':'wuhan-confirmed-3-phase2', 'parentId':'amap-4201-420100024331-0', 'parentName':'3号线', 'part':'二期延长段', 'stations':'沌阳大道 车城南路 枫树一路 枫树五路 全力二路 全力三路 文岭'.split(), 'status':'construction', 'note':'采用官方已公开工程站名，非最终运营命名通告。原五座新站依据市政府2024-11-28工程报道；新增车城南路依据经开区2026-09-30在建报道。车城南路按官方路口说明大致定位；其余新增站为公开地图位置。'},
    {'id':'wuhan-confirmed-6-phase3', 'parentId':'amap-4201-420100024335-0', 'parentName':'6号线', 'part':'三期延长段', 'stations':'东风公司 江汉大学 博艺路'.split(), 'status':'construction', 'note':'采用官方已公开工程站名，非最终运营命名通告。两座新站江汉大学、博艺路及站序依据市国资委2022-12-30开工报道和2024年规划许可；不把博学路误作站名。新增站为公开地图位置。'},
    {'id':'wuhan-confirmed-21-connector', 'parentId':'amap-4201-900000075739-0', 'parentName':'阳逻线', 'part':'延长段（12号线连接线）', 'stations':'后湖大道 新春 中一路'.split(), 'status':'construction', 'note':'后湖大道—新春—中一路，依据市政府2025-02-19工程报道。建设项目名称为12号线连接线，建成后与阳逻线贯通运营，归入阳逻线。新春为公开工程站名，中一路共用8/12号线站点。'},
    {'id':'wuhan-confirmed-11-hanyang', 'parentId':'amap-4201-900000073743-0', 'parentName':'11号线', 'part':'三期汉阳站段', 'stations':'汉阳站 黄金口'.split(), 'status':'planned', 'note':'两站及站序依据汉阳区政府2022-07-28工程说明，归入11号线，与四期共用汉阳站、与4号线共用黄金口。站名有工程依据，未核实当前实际开工状态，按规划显示；不代表已开通。'},
]
future_ten = [
    {'id':'wuhan-confirmed-10-future-west', 'part':'远期西段（走廊）', 'anchors':[
        ['常福方向（示意控制点）',114.04,30.44], '枫树五路',
        ['沌口方向（示意控制点）',114.16,30.48], '四新南路',
        ['江城大道走廊（示意控制点）',114.226,30.545], '五里墩',
        ['汉江过江走廊（示意控制点）',114.254,30.577],
        ['汉口方向（示意控制点）',114.233,30.602], '汉口火车站'],
     'note':'远期规划的大致走廊，非完整站名表或批复工程线位。常福—汉阳—汉口走向依据市交通局2026-07-03介绍及2025-10-15提案答复；枫树五路换乘3号线依据市政府2024-11-28报道，四新南路换乘12号线依据2024-04-23报道，五里墩换乘4号线依据规划局2022-10-26答复。地域控制点不代表车站；未新增未核实站名，也未加入仙桃段。'},
    {'id':'wuhan-confirmed-10-future-east', 'part':'远期东向（走廊）', 'anchors':[
        '白玉山', ['远期过江方向（示意控制点）',114.51,30.647], ['阳逻方向（示意控制点）',114.56,30.672]],
     'note':'阳逻方向远期走廊，非确定车站或工程线位，依据市交通局2026-07-03公开走向。东段与新港线未来拆分关系、站名和站位以批复及命名通告为准；阳逻方向只是区域控制点，不把它擅自合并为现有阳逻站。'},
]

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
    '江汉大学': (114.158431, 30.507573, 'BV09081170'),
    '博艺路': (114.155843, 30.519492, 'BV09081169'),
}
# Public map locations, not surveyed engineering center coordinates.
bd = {
    '汉钢': (114.24024280232, 30.571606994603, 14416),
    '汤山': (114.187508496, 30.547217791127, 14573),
    '梅林': (114.22617614651, 30.525042579894, 14576),
    '江国路': (114.28854163535, 30.50800216442, 14578),
    '工业路': (114.39366224443, 30.62538989106, 14494),
    '万家咀': (114.47907726453, 30.603172427124, 14532),
    '文岭': (114.08569805289027, 30.49223494696167, 18932),
    '全力三路': (114.09018958044015, 30.469592927830522, 18933),
    '全力二路': (114.09827433002995, 30.46126617444225, 18929),
    '枫树五路': (114.1171387457395, 30.466246748862897, 18928),
    '枫树一路': (114.136901466959, 30.47519557213376, 18927),
    '新春': (114.30263263524, 30.651657101089, 14546),
}
# This station has an official road-junction location, but no surveyed coordinate in the cited notice.
approximate = {'车城南路': (114.143, 30.486, 'https://www.whkfq.gov.cn/xwzx/yw/kfqyw/qnxw/202406/t20240605_2411949.html')}

def bd_to_gcj(lng, lat):
    x, y = lng - .0065, lat - .006
    z = math.sqrt(x*x + y*y) - .00002 * math.sin(y * math.pi * 3000 / 180)
    theta = math.atan2(y, x) - .000003 * math.cos(x * math.pi * 3000 / 180)
    return z * math.cos(theta), z * math.sin(theta)

stations = {}
for name in dict.fromkeys(ring + eleven + ten + [name for extension in extensions for name in extension['stations']] + [anchor for corridor in future_ten for anchor in corridor['anchors'] if isinstance(anchor,str)]):
    existing = next((s for s in base['stations'].values() if s['name'] == name), None)
    if existing:
        stations[name] = dict(existing, coordinateSource='public/transit/wuhan.json')
    else:
        if name in approximate:
            lng, lat, source = approximate[name]
            point = lng, lat
        elif name in gcj:
            lng, lat, poi = gcj[name]
            point = refresh.gcj_to_wgs(lng, lat)
            source = f'https://www.amap.com/place/{poi}'
        else:
            lng, lat, page = bd[name]
            point = refresh.gcj_to_wgs(*bd_to_gcj(lng, lat))
            source = f'https://www.icauto.com.cn/chuxing/d_{page}.html'
        stations[name] = {'id': f'wuhan-confirmed-station-{name}', 'name': name, 'lng': point[0], 'lat': point[1], 'coordinateSource': source}
result = {'ring': ring, 'eleven': eleven, 'ten': ten, 'extensions': extensions, 'futureTen':future_ten, 'stations': stations}
(ROOT / 'src/utils/wuhanConfirmedData.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
assert len(ring) == 37 and len(ten) == 13 and len(eleven) == 8
assert [len(extension['stations']) for extension in extensions] == [7,3,3,2]
print(f'Confirmed supplement: {len(stations)} named stations, 37-stop ring, 13-stop Line 10, 8-stop Line 11 extension.')
