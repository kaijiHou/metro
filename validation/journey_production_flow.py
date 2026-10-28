"""Production smoke, including /metro/ resource paths. Isolated test server only."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from shared_storage_test_guard import check_storage

ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('METRO_TEST_URL','http://127.0.0.1:5176/metro/').rstrip('/')+'/'
check_storage(BASE,True)
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome',headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append(r.url) if '/transit/' in r.url else None)
 page.goto(BASE,wait_until='networkidle',timeout=60000)
 panel=page.get_by_role('region',name='站到站 · 路线查询')
 expect(panel.get_by_role('button',name='规划路线',exact=True)).to_be_enabled(timeout=15000)
 # Wait for the initial editor snapshot and its automatic Wuhan supplements.
 page.wait_for_function("JSON.parse(localStorage.getItem('metro-planner.project')||'{}').cityId==='wuhan'")
 saved=page.evaluate("localStorage.getItem('metro-planner.project')")
 def choose(label,name):
  panel.get_by_role('combobox',name=label,exact=True).fill(name)
  panel.get_by_role('listbox',name=label+'搜索结果').get_by_role('option').filter(has_text=name).first.click()
 choose('起点站','华中科技园');choose('终点站','洪山广场')
 panel.get_by_role('button',name='规划路线',exact=True).click()
 expect(panel.get_by_label('路线结果')).to_contain_text('有轨电车')
 expect(panel.get_by_label('路线结果')).to_contain_text('1 次换乘');checks.append('production tram/metro query and itinerary')
 assert page.evaluate("localStorage.getItem('metro-planner.project')")==saved
 checks.append('production query leaves saved project unchanged')
 failing={'yes':True}
 def fail_or_continue(route):
  if failing['yes']:route.fulfill(status=503,body='test offline')
  else:route.continue_()
 page.route('**/transit/nanjing.json',fail_or_continue)
 panel.get_by_label('查询城市').select_option('nanjing')
 expect(panel).to_contain_text('线路加载失败')
 expect(panel.get_by_role('button',name='规划路线',exact=True)).to_be_disabled()
 failing['yes']=False;panel.get_by_role('button',name='重试查询数据').click()
 expect(panel.get_by_role('button',name='规划路线',exact=True)).to_be_enabled()
 choose('起点站','麒麟生态公园');choose('终点站','新街口')
 panel.get_by_role('button',name='规划路线',exact=True).click()
 expect(panel.get_by_label('路线结果')).to_contain_text('麒麟有轨电车')
 checks.append('data failure is visible, stale routes cleared, retry succeeds')
 assert requests and all('/metro/transit/' in u for u in requests)
 checks.append('subpath transit assets use correct base URL')
 assert not errors,errors;checks.append('no runtime errors')
 browser.close()
(ROOT/'validation/journeys/production-results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),'utf8')
print(json.dumps(checks,ensure_ascii=False))
