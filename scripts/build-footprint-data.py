"""Rebuild OCHA/HDX city derivatives using explicit PCODE joins. Requires shapely2.1.2 + pyshp2.3.1."""
import json,hashlib,urllib.request,io
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as E
from collections import defaultdict
import shapefile
from shapely.geometry import shape,mapping
from shapely import make_valid,union_all
ROOT=Path(__file__).resolve().parents[1]
SOURCES={'geometry':'https://data.humdata.org/dataset/17a2aaa2-dea9-4a2e-8b3f-92d1bdfb850c/resource/9e67ddf9-ce26-4b7a-82b1-51e5ca0714c8/download/chn_adm_ocha_2020_shp.zip','gazetteer':'https://data.humdata.org/dataset/17a2aaa2-dea9-4a2e-8b3f-92d1bdfb850c/resource/20eb7fd0-cf6b-4e05-af2d-7e124b6a37cc/download/chn_admgz_2020.xlsx'}
paths={k:ROOT/'validation'/name for k,name in [('geometry','phase4b-original-shp.zip'),('gazetteer','phase4b-gazetteer.xlsx')]}
for key,path in paths.items():
 if not path.exists():path.write_bytes(urllib.request.urlopen(SOURCES[key],timeout=60).read())
z=ZipFile(paths['gazetteer']);ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ss=[''.join(e.itertext()) for e in E.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)]
rows=[]
for r in E.fromstring(z.read('xl/worksheets/sheet3.xml')).findall('.//m:row',ns)[1:]:
 vals={}
 for c in r.findall('m:c',ns):
  v=c.find('m:v',ns);text=v.text if v is not None else ''.join(c.itertext());vals[''.join(filter(str.isalpha,c.get('r')))]=ss[int(text)] if c.get('t')=='s' else text
 rows.append(vals)
archive=ZipFile(paths['geometry'])
def read_shapes(level):
 name=f'chn_admbnda_adm{level}_ocha_2020'
 assert 'WGS_1984' in archive.read(name+'.prj').decode()
 r=shapefile.Reader(shp=io.BytesIO(archive.read(name+'.shp')),shx=io.BytesIO(archive.read(name+'.shx')),dbf=io.BytesIO(archive.read(name+'.dbf')),encoding='utf-8')
 return [(s.record.as_dict(),make_valid(shape(s.shape.__geo_interface__))) for s in r.iterShapeRecords()]
original=read_shapes(2);by_code={r['ADM2_PCODE']:(r,g) for r,g in original}
assert len(by_code)==len(rows)==361
for row in rows:
 r,g=by_code[row['E']]
 assert (row['C'],row['D'],row['H'],row['A'].strip())==(r['ADM2_EN'],r['ADM2_ZH'],r['ADM1_PCODE'],r['Admin_type'].strip())
allowed={'Prefecture-level city','Autonomous prefecture','Prefecture','Municipality','League','Special Administrative Region','Sub-province-level prefecture'}
by_en={r['ADM2_EN']:(r,g) for r,g in original if r['ADM2_EN'] in ['Jinan','Laiwu']}
provinces=defaultdict(list);cities=[];missing=[];audit=[]
def geometry(g):
 assert g.geom_type in ['Polygon','MultiPolygon'] and not g.is_empty
 def rounded(v):return [rounded(x) for x in v] if isinstance(v,(list,tuple)) else round(v,6)
 return {'type':g.geom_type,'coordinates':rounded(mapping(g)['coordinates'])}
for r,g in original:
 if r['ADM2_EN']=='Laiwu':continue
 if r['Admin_type'] not in allowed:
  missing.append({'name':r['ADM2_ZH'],'province':r['ADM1_ZH'],'sourceCode':r['ADM2_PCODE'],'level':r['Admin_type'].strip() or 'province','reason':'来源层级不符合市级；不参与点亮与统计'})
  continue
 merged=[]
 if r['ADM2_EN']=='Jinan':g=union_all([g,by_en['Laiwu'][1]]);merged=['Laiwu']
 code='ocha2020-'+r['ADM2_PCODE'];prov=r['ADM1_PCODE'];name='那曲市' if r['ADM2_EN']=='Nagqu Prefecture' else r['ADM2_ZH']
 cities.append({'cityCode':code,'name':name,'aliases':[r['ADM2_EN'],r['ADM2_ZH']],'provinceCode':prov,'provinceName':r['ADM1_ZH'],'level':r['Admin_type'],'bounds':list(g.bounds),'shapeId':'ocha2020-'+r['ADM2_PCODE']})
 provinces[prov].append({'type':'Feature','id':code,'properties':{'cityCode':code,'name':name},'geometry':geometry(g)})
 audit.append({'cityCode':code,'sourceCode':r['ADM2_PCODE'],'english':r['ADM2_EN'],'provinceCode':prov,'merged':merged,'join':'SHP ADM2_PCODE exact match to gazetteer ADM2_PCODE'})
assert len({c['cityCode'] for c in cities})==len(cities)==339
out=ROOT/'public/footprint'
for prov,features in provinces.items():(out/(prov+'.json')).write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
province_features=[]
short={'内蒙古自治区':'内蒙古','广西壮族自治区':'广西','西藏自治区':'西藏','宁夏回族自治区':'宁夏','新疆维吾尔自治区':'新疆','香港特别行政区':'香港','澳门特别行政区':'澳门'}
for r,g in read_shapes(1):
 name=r['ADM1_ZH'];p=r['ADM1_PCODE']
 province_features.append({'type':'Feature','id':p,'properties':{'provinceCode':p,'name':short.get(name,name.removesuffix('省').removesuffix('市')),'supported':p in provinces,'labelPoint':list(g.representative_point().coords[0])},'geometry':geometry(g)})
(out/'province-outlines.json').write_text(json.dumps({'type':'FeatureCollection','features':province_features},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
meta={'schemaVersion':1,'version':'ocha2020-hdx-v1','retrievedAt':'2026-10-15','license':'CC BY 3.0 IGO','attribution':'OCHA/HDX COD-AB China; ITOS. Derivatives: Metro Planner (validation, rounding, Laiwu merge).','sources':SOURCES,'sourceHashes':{k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in paths.items()},'cities':cities,'missing':missing,'notes':['来源建立日期不明；2020资源版本，HDX称2024年复核；非现行法定界线图。','台湾只有整省几何，仅显示省界；未作为城市收录。省直辖县级等非地级单元未纳入。','原莱芜边界合并到济南；那曲显示现名；其他历史边界调整可能未反映。']}
(out/'catalog.json').write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(out/'mapping-audit.json').write_text(json.dumps(audit,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(len(cities),'supported;',len(missing),'excluded;',len(provinces),'city partitions;',len(province_features),'province outlines; city geometry bytes',sum(p.stat().st_size for p in out.glob('CN*.json')))
