"""Snapshot factual first/last train tables from Wuhan Metro's public website.

The public REST requests below are the same ones used by metro-operation.html
and redirect-article.html. No authenticated/system/synchronization API is called.
"""
import argparse,hashlib,json,re,time,urllib.request
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path

BASE='https://www.wuhanrt.com'

class Tables(HTMLParser):
 def __init__(self):
  super().__init__();self.tables=[];self.rows=None;self.row=None;self.cell=None;self.depth=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='table':
   self.depth+=1
   if self.depth==1:self.rows=[]
  if self.depth!=1:return
  if tag=='tr':self.row=[]
  if tag in ['td','th']:
   self.cell={'text':'','rows':int(a.get('rowspan','1')),'cols':int(a.get('colspan','1'))}
  elif tag in ['br','p'] and self.cell is not None:self.cell['text']+=' '
 def handle_data(self,data):
  if self.depth==1 and self.cell is not None:self.cell['text']+=data
 def handle_endtag(self,tag):
  if self.depth==1:
   if tag in ['td','th'] and self.cell is not None:
    self.cell['text']=re.sub(r'\s+',' ',self.cell['text']).strip();self.row.append(self.cell);self.cell=None
   if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None
   if tag=='table':self.tables.append(self.expand(self.rows));self.rows=None
  if tag=='table':self.depth-=1
 @staticmethod
 def expand(rows):
  grid=[];spans={}
  for row in rows:
   cells={col:text for col,(text,left) in spans.items()};spans={col:(text,left-1) for col,(text,left) in spans.items() if left>1}
   col=0
   for cell in row:
    while col in cells:col+=1
    for offset in range(cell['cols']):
     cells[col+offset]=cell['text']
     if cell['rows']>1:spans[col+offset]=(cell['text'],cell['rows']-1)
    col+=cell['cols']
   if cells:grid.append([cells.get(i,'') for i in range(max(cells)+1)])
  width=max(map(len,grid),default=0)
  return [row+['']*(width-len(row)) for row in grid]

def build(folder,refresh):
 folder.mkdir(parents=True,exist_ok=True)
 sources=[]
 def fetch(path,key):
  url=BASE+path;file=folder/f'{key}.json'
  if refresh or not file.exists():
   request=urllib.request.Request(url,headers={'User-Agent':'MetroPlanner/1.0 public timetable reference (github.com/kaijiHou/metro)'})
   with urllib.request.urlopen(request,timeout=30) as response:raw=response.read(8*1024*1024)
   envelope={'url':url,'retrievedAt':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'response':json.loads(raw)}
   file.write_text(json.dumps(envelope,ensure_ascii=False),'utf8');time.sleep(.15)
  envelope=json.loads(file.read_text('utf8'));sources.append({k:envelope[k] for k in ['url','retrievedAt','sha256']})
  assert envelope['response']['code']==200,url
  return envelope['response']['data']
 columns=fetch('/helios/api/rest/metroColumn/queryAllList','columns')
 lines=[]
 for column in columns:
  if column.get('parentCode')!='504':continue
  id=column['id'];article=fetch(f'/helios/api/rest/metroArticle/queryByPage?page=0&size=1&firstClass={id}',f'line-{id}')['records'][0]
  parser=Tables();parser.feed(article['content']);tables=[]
  for grid in parser.tables:
   if not any(re.search(r'\d{1,2}[:：]\d{2}',cell) for row in grid for cell in row):continue
   start=next((i for i,row in enumerate(grid) if sum(bool(re.search(r'\d{1,2}[:：]\d{2}',cell)) for cell in row)>=2 and any('首班' in cell for above in grid[:i] for cell in above)),None)
   if start is None:raise ValueError(f'Cannot identify timetable rows: {id}')
   title=' / '.join(dict.fromkeys(grid[0]))
   assert start==3,(id,start)
   directions=[];at=0
   while at<len(grid[2]):
    end=at+1
    while end<len(grid[2]) and grid[1][end]==grid[1][at]:end+=1
    assert grid[2][at]=='车站',(id,grid[2])
    directions.append({'name':grid[1][at],'columns':grid[2][at:end],'rows':[row[at:end] for row in grid[start:]]})
    at=end
   tables.append({'title':title,'directions':directions})
  assert tables,(id,article['title'])
  number=int(re.search(r'\d+',column['className'])[0])
  lines.append({'id':str(number),'name':column['className'],'transport':'metro','publishedAt':article['releaseTime'][:10],
   'sourceUrl':f'{BASE}/news-content.html?id={article["id"]}','quality':'official','tables':tables})
  print(column['className'],article['releaseTime'],len(tables),sum(len(d['rows']) for t in tables for d in t['directions']),flush=True)
 assert len(lines)==13
 checked=max(s['retrievedAt'] for s in sources)[:10]
 return {'cityId':'wuhan','checkedAt':checked,'provider':'武汉地铁集团官方网站','sources':sources,'lines':sorted(lines,key=lambda l:int(l['id']))}

def write_report(catalog):
 def clock(text):
  m=re.match(r'^(\d{1,2}):',text)
  return ('次日 ' if m and int(m[1])<4 else '')+text
 rows=['# 武汉地铁与有轨电车运营时间整理','',f'核对日期：{catalog["checkedAt"]}（北京时间）。整理武汉地铁官网当前目录返回的13条线、28份按日别区分的表；电车另列4条交路。此处为首末班事实摘要，完整各站/各方向时间可在程序的“武汉首末班与运营时间”查询，原数据为 `src/data/wuhan-service.json`。','',
 '## 先区分三种时间','',
 '- 首末班：各站可乘的首班、末班发车时间；终点“到达/到点”仅为到达，不是上车时间。跨零点以原运营日延续表示“次日”。',
 '- 发车间隔：高峰最小间隔仅适用公告指定时段，不可均匀铺成全天班次。',
 '- 实时到站：尚未取得经核实可使用的官方实时车辆位置/下一班接口。没有为每班列车生成到站倒计时。路线中的抵达时间是旅程估算，未校验开收班、调休和末班换乘能否赶上。','',
 '## 地铁首末班摘要','',
 '| 线路／日别 | 方向 | 起点发车（原表） | 终点末班到达（原表） | 官方来源发布日期 |',
 '|---|---|---|---|---|']
 for line in catalog['lines']:
  for table in line['tables']:
   for direction in table['directions']:
    first=direction['rows'][0]
    departure='；'.join(f'{c} {clock(value)}' for c,value in zip(direction['columns'][1:],first[1:]))
    arrival=' / '.join(dict.fromkeys(clock(c) for c in direction['rows'][-1][1:] if '到达' in c or '到点' in c)) or '见完整原表'
    rows.append(f'| {table["title"]} | {direction["name"]} | {first[0]}：{departure} | {arrival} | [{line["publishedAt"]}]({line["sourceUrl"]}) |')
 rows+=['','特别说明：7号线和11号线保留不同终点的末班列，不能只取一个末班时间。12号线当前官方表仅一期墨水湖公园—钢都花园23站，没有补造全环时刻。6号线官网当前文章仍标2023-08-18，11号线为2025-11-07；抓取日期不代表这些旧表重新生效。各站中途始发、短交路及节假日变化以完整原表和运营公告为准。','',
 '## 有轨电车首末班参考','',
 '| 交路 | 方向 | 首班发车 | 末班发车 | 依据／时效限制 |','|---|---|---|---|---|']
 trams=json.loads(Path('src/data/wuhan-tram-service.json').read_text('utf8'))
 for line in trams['lines']:
  for direction in line['tables'][0]['directions']:
   first=direction['rows'][0]
   rows.append(f'| {line["name"]} | {direction["name"]} | {first[1]} | {first[2]} | [{line["provider"]}，{line["publishedAt"] or "无可靠生效日"}]({line["sourceUrl"]}) |')
 rows+=['']+[f'- **{line["name"]}**：{line["note"]}' for line in trams['lines']]
 rows+=['','电车仅整理到了两端发车资料，未取得各中间站每班到站时刻。旧公告、第三方数据与未核实的现行信息在程序中明确区分。','',
 '## 已公开的地铁高峰间隔','',f'来源：[{trams["headwaySource"]["provider"]}，{trams["headwaySource"]["publishedAt"]}]({trams["headwaySource"]["url"]})。以下不是全天固定间隔。','']
 rows += [f'- {id}号线：{text}' for id,text in trams['headways'].items()]
 rows += ['','其他线路暂无此次核实的完整现行间隔表，不以零或统一常数冒充真实班次。','',
 '## 程序中的保守行程估算','',
 '按站间连线距离估算车程，地铁40／电车22公里每小时，每区间加30秒停站；另外计入进站3分钟，地铁候车4／电车候车8分钟每次，换乘步行8分钟每次（候车另计）。路线排序也使用这些成本，不只给结果额外加固定分钟数。结果拆分车程、候车和步行，并可按输入的北京时间累计预计上车、下车与目的地抵达时刻。这些数字是本程序的假设，不是运营方发布的列车运行图。','',
 '## 来源与复现','',
 '官方入口：[武汉地铁运营服务](https://www.wuhanrt.com/metro-operation.html)。使用该页面实际调用的公开只读接口，未调用系统管理或同步接口；各来源URL、抓取时间和SHA256在数据中保存。`python scripts/update-wuhan-service.py --refresh`重新下载；去掉`--refresh`可从`validation/wuhan-service/`缓存复现。原始响应不提交，个人项目和旅行库不参与处理。','']
 Path('docs/WUHAN_SERVICE_TIMES.md').write_text('\n'.join(rows),'utf8')

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=Path('validation/wuhan-service'));p.add_argument('--refresh',action='store_true');args=p.parse_args()
 result=build(args.source,args.refresh)
 Path('src/data/wuhan-service.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
 write_report(result)
