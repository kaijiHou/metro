"""Build licensed county polygons, retain city IDs and audit every bilingual/parent join."""
import hashlib,json,re,urllib.request,unicodedata,itertools
from pathlib import Path
from collections import defaultdict
from shapely.geometry import shape,mapping
from shapely import make_valid,STRtree
from pypinyin import pinyin,Style

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/footprint/counties'
REF='c49d495b40ac73eb1a66f6eeae5f8fd10696f035'
URLS={'geometry':'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/CHN/ADM3/geoBoundaries-CHN-ADM3_simplified.geojson',
      'areas':f'https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/{REF}/dist/areas.json',
      'cities':f'https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/{REF}/dist/cities.json'}
files={'geometry':'phase4b-counties-source.geojson','areas':'phase4b-county-areas.geojson','cities':'phase4b-county-cities.geojson'}
EXPECTED={'geometry':'ea64fe24f193e319ce48895f229a5b3f46d2a60f3f3df67e6172ab037e4cc8fd','areas':'fbe1575eecba4ffd4d50c3d2d6887bd873ceca6a203fb2d66698b5007826b6b6','cities':'3f569aaa0bfbeba72f1597657511c64f54107baae71710fef7146f390a41af32'}
raw={};hashes={}
for key,name in files.items():
    p=ROOT/'validation'/name
    if not p.exists():p.write_bytes(urllib.request.urlopen(URLS[key],timeout=60).read())
    hashes[key]=hashlib.sha256(p.read_bytes()).hexdigest();raw[key]=json.loads(p.read_text('utf8'))
    assert hashes[key]==EXPECTED[key],f'{key} input SHA256 differs from pinned source'
assert hashes['geometry']=='ea64fe24f193e319ce48895f229a5b3f46d2a60f3f3df67e6172ab037e4cc8fd'
outlines=json.loads((ROOT/'public/footprint/province-outlines.json').read_text('utf8'))['features']
city_catalog=json.loads((ROOT/'public/footprint/catalog.json').read_text('utf8'))['cities']
city_by_code={c['cityCode']:c for c in city_catalog}
province_names={c['provinceCode']:c['provinceName'] for c in city_catalog}
province_names['CN071']='台湾省'
city_features=[]
for p in (ROOT/'public/footprint').glob('CN*.json'):city_features+=json.loads(p.read_text('utf8'))['features']
province_shapes=[make_valid(shape(f['geometry'])) for f in outlines]
city_shapes=[make_valid(shape(f['geometry'])) for f in city_features]
province_tree=STRtree(province_shapes);city_tree=STRtree(city_shapes)
area_cities={c['code']:c['name'] for c in raw['cities']}
ethnic=['土家族','苗族','彝族','侗族','瑶族','壮族','回族','满族','蒙古族','朝鲜族','藏族','哈萨克族','维吾尔族','傣族','黎族','布依族','白族','景颇族','傈僳族','纳西族','锡伯族','达斡尔族','鄂伦春族','鄂温克族','裕固族','保安族','东乡族','撒拉族','仫佬族','水族','畲族','毛南族','哈尼族','拉祜族','佤族','布朗族','普米族','阿昌族','德昂族','仡佬族','塔吉克族','柯尔克孜族']
def normalize(text):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode().lower())
def root_name(name):
    for e in ethnic:name=name.replace(e,'')
    return re.sub('(自治县|自治旗|市辖区|特区|矿区|新区|林区|县|区|市|旗|區|縣)$','',name)
def spellings(name):
    options=pinyin(root_name(name),style=Style.NORMAL,heteronym=True)
    return {normalize(''.join(parts)) for parts in itertools.islice(itertools.product(*options),128)}
areas=defaultdict(list)
for a in raw['areas']:
    for root in spellings(a['name']):
        if root:areas['CN'+a['provinceCode'].zfill(3)].append((root,a))
def parent(g,tree,geometries,features):
    overlaps=[(float(g.intersection(geometries[int(i)]).area/g.area),features[int(i)]) for i in tree.query(g)]
    return max(overlaps,key=lambda x:x[0]) if overlaps else (0,None)
units=[];audit=[];missing=[];partitions=defaultdict(list);used=set()
for f in raw['geometry']['features']:
    props=f['properties'];g=make_valid(shape(f['geometry']))
    if g.geom_type not in ('Polygon','MultiPolygon') or g.is_empty:missing.append({'name':props['shapeName'],'reason':'非有效县级面'});continue
    pr,p=parent(g,province_tree,province_shapes,outlines)
    if not p or pr<0.75:missing.append({'name':props['shapeName'],'reason':'省级交叠无法明确核对'});continue
    province=p['properties'];code=province['provinceCode'];province_name=province_names.get(code,province['name'])
    cr,c=parent(g,city_tree,city_shapes,city_features)
    city=city_by_code.get(c['properties']['cityCode']) if c and cr>=0.8 else None
    if city and city['provinceCode']!=code:city=None
    source_name=props['shapeName'];english=normalize(source_name)
    source_chinese=spellings(source_name.split('(')[0].strip()) if re.search('[\u4e00-\u9fff]',source_name) else set()
    candidates=list({a['code']:a for r,a in areas[code] if r in source_chinese or (english.startswith(r) and (english[len(r):] in ('','city','county','district','banner','xian','newarea','forestrydistrict') or re.match(r'^(?:hui|manchu|mongol|tibetan|miao|tujia|zhuang|dong|yao|korean|dai|yi|li|kazakh|uyghur|autonomous)',english[len(r):])))}.values())
    if len(candidates)>1 and city:candidates=[a for a in candidates if area_cities.get(a['cityCode'])==city['name']]
    if len(candidates)!=1:missing.append({'name':source_name,'province':province['name'],'reason':'中文名称无法唯一核验','candidates':[a['name'] for a in candidates]});continue
    a=candidates[0]
    parent_name=area_cities.get(a['cityCode'])
    if parent_name:
        reference_parent=next((c for c in city_catalog if c['provinceCode']==code and c['name']==parent_name),None)
        if reference_parent:city=reference_parent
    # A present-day bilingual name must not silently stand in for two historical polygons.
    if a['code'] in used:missing.append({'name':source_name,'province':province['name'],'reason':'现名映射冲突，未自动合并历史区划'});continue
    used.add(a['code'])
    county_id='gb2017-'+hashlib.sha256(props['shapeID'].encode()).hexdigest()[:16]
    unit={'cityCode':county_id,'name':a['name'],'aliases':[source_name,a['code']],'provinceCode':code,'provinceName':province_name,'level':'County-level division','kind':'county','bounds':list(g.bounds),'shapeId':props['shapeID'],'parentCityName':city['name'] if city else parent_name or '省级直属/上级市未核定'}
    if a['name'].endswith('市') and not a['code'].endswith('00'):unit['level']='County-level city'
    label_geometry=max(g.geoms,key=lambda part:part.area) if g.geom_type=='MultiPolygon' else g
    label=label_geometry.representative_point();unit['labelPoint']=[label.x,label.y]
    if city:unit['parentCityCode']=city['cityCode']
    def rounded(v):return [rounded(x) for x in v] if isinstance(v,(tuple,list)) else round(v,6)
    geometry={'type':g.geom_type,'coordinates':rounded(mapping(g)['coordinates'])}
    units.append(unit);partitions[code].append({'type':'Feature','id':county_id,'properties':{'cityCode':county_id,'name':a['name']},'geometry':geometry})
    audit.append({'code':county_id,'shapeID':props['shapeID'],'sourceName':source_name,'name':a['name'],'nameReferenceCode':a['code'],'provinceOverlap':round(pr,5),'cityOverlap':round(cr,5),'parentCityCode':unit.get('parentCityCode'),'join':'same-province unique romanized root; city disambiguation when necessary'})
assert len({u['cityCode'] for u in units})==len(units)
for prov,features in partitions.items():(OUT/(prov+'.json')).write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf8')
catalog={'version':'gbopen-9469f09-2017-v1','license':'ODbL 1.0','attribution':'OpenStreetMap contributors / Lee Beryman / geoBoundaries','cities':units,'provinces':[{'code':f['properties']['provinceCode'],'name':province_names.get(f['properties']['provinceCode'],f['properties']['name']),'bounds':list(province_shapes[i].bounds)} for i,f in enumerate(outlines)],'missing':missing,'notes':['2017历史边界与中文名核验子集，非当前全国全覆盖；旧市级记录保留，未自动转换为全部下辖区县。']}
(OUT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(OUT/'audit.json').write_text(json.dumps({'included':len(units),'excluded':missing,'mappings':audit},ensure_ascii=False,separators=(',',':')),encoding='utf8')
(OUT/'sources.json').write_text(json.dumps({'urls':URLS,'sha256':hashes,'license':'https://opendatacommons.org/licenses/odbl/1-0/','nameLicense':'https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/'+REF+'/LICENSE','metadata':'https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM3/','sourceGeometryCount':len(raw['geometry']['features']),'supported':len(units),'excluded':len(missing),'modifications':['geometry validation','round coordinates to 6 decimals','province/city spatial crosswalk','unique bilingual name matching; exclude ambiguities'],'retrievedAt':'2026-10-17'},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'supported':len(units),'excluded':len(missing),'provinces':len(partitions),'hubei':[(u['name'],u['cityCode']) for u in units if u['provinceCode']=='CN042']},ensure_ascii=True),flush=True)
