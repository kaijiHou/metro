"""Build the audited ODbL supplement; original transit snapshots stay read-only."""
import argparse,json,re
from pathlib import Path

REFERENCES={
 'wuhan':[
  'https://jtj.wuhan.gov.cn/jtzx/zwdt/202311/t20231128_2309248.shtml',
  'https://media.hubei.gov.cn/zyxmt/push/weixin/202311/t20231129_4976176.shtml',
  'https://news.cjn.cn/sywh/201707/t3044730.htm',
  'https://www.icauto.com.cn/chuxing/bl_66264.html',
  'https://www.icauto.com.cn/chuxing/bl_66265.html',
  'https://www.icauto.com.cn/chuxing/bl_66685.html',
  'https://zh.wikipedia.org/wiki/金融港北站',
  'https://www.china-emu.cn/UrbanRails/Line/420192/'],
 'nanjing':[
  'https://newtown.nanjing.gov.cn/xcyx/pzxc/jtpt/201703/t20170317_2112581.html',
  'https://jtj.nanjing.gov.cn/njsjtysj/202503/t20250305_5088720.html',
  'https://www.nanjing.gov.cn/msxx/202407/t20240701_5125798.html',
  'https://zh.wikipedia.org/wiki/南京有轨电车',
  'https://www.china-emu.cn/UrbanRails/Line/320192/',
  'https://qilinpark.nanjing.gov.cn/xwzx/gzdt/202512/t20251222_5748356.html']}
TRANSFERS={
 'wuhan':{'车轮广场':'沌阳大道','华中大':'华中科技大学','步行街省中医院':'珞雄路','佛祖岭':'佛祖岭','光谷大道':'金融港北','光谷七路':'光谷七路'},
 'nanjing':{'奥体中心东门':'奥体东','元通':'元通','鱼嘴':'鱼嘴','平良大街':'平良大街','吴侯街':'吴侯街','马群':'马群','石杨路':'石杨路'}}
ROUTES={
 'wuhan':[(13962099,'t1','车都有轨电车T1','#d45434'),(13962100,'t1','车都有轨电车T1','#d45434'),
  (11871034,'l1','光谷有轨电车L1','#129b8b'),(11871033,'l1','光谷有轨电车L1','#129b8b'),
  (11871070,'l2','光谷有轨电车L2','#7952ac'),(11871039,'l2','光谷有轨电车L2','#7952ac')],
 'nanjing':[(16159336,'hexi','河西有轨电车1号线','#30935d'),(16159337,'hexi','河西有轨电车1号线','#30935d'),
  (16159338,'qilin','麒麟有轨电车2号线','#d47b20'),(16159339,'qilin','麒麟有轨电车2号线','#d47b20')]}

def build(city,folder):
 raw=json.loads((folder/f'{city}.json').read_text('utf8'))
 ix={(e['type'],e['id']):e for e in raw['elements']}
 base=json.loads(Path(f'public/transit/{city}.json').read_text('utf8'))['project']
 stations={};lines={};names={};audit=[]
 def stop(node):
  name=re.sub(r'\s+','',node['tags']['name'])
  # Both OSM platforms were incorrectly called 滨湖社区: source full T1 list distinguishes 车城大道.
  if city=='wuhan' and node['id'] in [9605144713,4224651697]:name='车城大道'
  if name in names:return names[name]
  target=TRANSFERS[city].get(name)
  if target:
   matches=[s for s in base['stations'].values() if s['name']==target]
   assert len(matches)==1,(city,name,target)
   s=dict(matches[0]);s['aliases']=[name] if name!=s['name'] else []
   assert abs(s['lng']-node['lon'])<.012 and abs(s['lat']-node['lat'])<.012,(name,s,node)
   audit.append({'tram':name,'metro':target,'stationId':s['id'],'osmNode':node['id']})
  else:
   s={'id':f'osm-tram-{city}-{node["id"]}','name':name,'lng':node['lon'],'lat':node['lat']}
  stations[s['id']]=s;names[name]=s['id'];return s['id']
 for relation,ref,name,color in ROUTES[city]:
  r=ix[('relation',relation)];ids=[stop(ix[('node',m['ref'])]) for m in r['members'] if m['type']=='node']
  assert len(ids)==len(set(ids)),relation
  root=f'osm-tram-{city}-{ref}';id=root if root not in lines else f'{root}-reverse'
  lines[id]={'id':id,'name':name if id==root else name+'（反向）','color':color,'transport':'tram','direction':'forward',
   'status':'existing','visible':True,'locked':True,'nodes':[{'type':'station','id':s} for s in ids],
   'planningNote':f'OSM relation {relation}；站位连线，非精确轨道。上下行按各自停站顺序。',**({'parentLineId':root} if id!=root else {})}
 if city=='wuhan':
  # L3 uses L1's directional northern section and L2's southern section.
  # 15-stop southbound is reported by Wuhan transport bureau; northbound follows
  # the existing one-way northern track, without the two opposite-direction stops.
  north=['华中大','步行街省中医院','常青藤路','创业街','雄楚大道','新竹路','武汉职院','光谷天地','软件园路','华夏学院']
  south=['万科城市花园','武大园','华中科技园','三园路','城铁汤逊湖']
  for reverse,sequence in [(False,north+south),(True,list(reversed([n for n in north if n not in ['步行街省中医院','常青藤路']]+south)))]:
   root='osm-tram-wuhan-l3';id=root+'-reverse' if reverse else root
   lines[id]={'id':id,'name':'光谷有轨电车L3'+('（反向）' if reverse else ''),'color':'#327bb2','transport':'tram','direction':'forward',
    'status':'existing','visible':True,'locked':True,'nodes':[{'type':'station','id':names[n]} for n in sequence],
    'planningNote':'L3：官方15站南向交路；北向依据L1单向段和L2共线段拼接。非实时班次，出行前核对运营公告。',**({'parentLineId':root} if reverse else {})}
 return {'retrievedAt':raw['retrievedAt'],'license':'ODbL-1.0','attribution':raw['attribution'],
  'sources':raw['sources'],'references':REFERENCES[city],'transfers':audit,
  'project':{'version':2,'cityId':city,'name':base['name']+' · 有轨电车补充','stations':stations,'waypoints':{},'lines':lines}}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);args=p.parse_args()
 result={city:build(city,args.source) for city in ROUTES}
 Path('src/data/trams.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
 print({city:{'stations':len(d['project']['stations']),'services':len(d['project']['lines'])//2} for city,d in result.items()})
