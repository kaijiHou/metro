"""Fetch OSM tram relations and their descendants, retaining source hashes.

Raw files belong in validation/tram-source; never reads personal projects/data.
"""
import argparse,concurrent.futures,hashlib,json,time,urllib.request
from datetime import datetime,timezone
from pathlib import Path

ROOTS={'wuhan':[16754867,13962101],'nanjing':[16159340,16159341],
       'suzhou':[5161881,13334262],'dalian':[16759640,16759639],
       'beijing':[8303696],'huangshi':[15394213]}
BASE='https://api.openstreetmap.org/api/0.6/relation/'

def download(city,roots,folder):
    elements={};seen=set();queue=list(roots);sources=[]
    while queue:
        relation=queue.pop(0)
        if relation in seen:continue
        seen.add(relation)
        if len(seen)>100:raise ValueError('Unexpected relation expansion')
        url=f'{BASE}{relation}/full.json'
        for attempt in range(3):
            try:
                request=urllib.request.Request(url,headers={'User-Agent':'MetroPlanner/1.0 (OSM tram snapshots; github.com/kaijiHou/metro)'})
                with urllib.request.urlopen(request,timeout=50) as response:raw=response.read(20*1024*1024+1)
                if len(raw)>20*1024*1024:raise ValueError('Unexpected source size')
                data=json.loads(raw);break
            except Exception:
                if attempt==2:raise
                time.sleep(2+attempt)
        sources.append({'url':url,'sha256':hashlib.sha256(raw).hexdigest()})
        for element in data['elements']:
            elements[(element['type'],element['id'])]=element
            if element['type']=='relation':
                for member in element.get('members',[]):
                    if member['type']=='relation' and element.get('tags',{}).get('type') in ['network','route_master']:
                        queue.append(member['ref'])
        time.sleep(.3)
    result={'cityId':city,'retrievedAt':datetime.now(timezone.utc).isoformat(),'license':'ODbL-1.0',
            'attribution':'© OpenStreetMap contributors','roots':roots,'sources':sources,'elements':list(elements.values())}
    (folder/f'{city}.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
    routes=[e for e in elements.values() if e['type']=='relation' and e.get('tags',{}).get('type')=='route']
    return {'city':city,'requests':len(seen),'routes':len(routes),'elements':len(elements)}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('validation/tram-source'));args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'README.md').write_text('Raw OSM tram snapshots, ODbL 1.0, source hashes and research only. No user data.\n','utf8')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda item:download(*item,args.output),ROOTS.items()))
    (args.output/'fetch-results.json').write_text(json.dumps(results,indent=2)+'\n','utf8')
    print(json.dumps(results))
