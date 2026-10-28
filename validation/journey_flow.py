"""Browser acceptance: METRO_TEST_URL=http://127.0.0.1:5175/ .venv/Scripts/python.exe validation/journey_flow.py

Use an isolated Vite server with METRO_DATA_DIR under validation/shared-storage.
All browser state is temporary. Original travel database is never opened.
"""
import json,os,re
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from shared_storage_test_guard import check_storage

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'validation/journeys'
BASE=os.environ.get('METRO_TEST_URL','http://127.0.0.1:5175/').rstrip('/')+'/'
check_storage(BASE,True)
original=json.loads((ROOT/'public/transit/wuhan.json').read_text('utf8'))['project']
original['name']='我的保留规划'
for id,lng in [('private-a',114.1),('private-b',114.2)]:original['stations'][id]={'id':id,'name':id,'lng':lng,'lat':30.4}
original['lines']['personal-planned']={'id':'personal-planned','name':'我的规划测试线','color':'#065588','status':'planned','nodes':[{'type':'station','id':id} for id in ['private-a','private-b']]}
checks=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS:',name,flush=True)

with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome',headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':1440,'height':1000})
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('localStorage.setItem("metro-planner.project",'+json.dumps(json.dumps(original,ensure_ascii=False))+')')
 page.route('https://overpass-api.de/api/interpreter',lambda route:route.fulfill(content_type='application/json',body='{"elements":[]}'))
 page.goto(BASE,wait_until='networkidle',timeout=60000)
 page.evaluate("""async()=>{window.metro=(await import('/src/store/metroStore.ts')).useMetroStore;window.view=(await import('/src/store/viewStore.ts')).useViewStore;
 const el=document.querySelector('.map-canvas');let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
 while(fiber&&fiber.type?.name!=='MapCanvas')fiber=fiber.return;
 for(let hook=fiber?.memoizedState;hook;hook=hook.next){const m=hook.memoizedState?.current;if(m?.queryRenderedFeatures){window.testMap=m;break}}} """)
 page.wait_for_function("testMap.getLayer('journey-line-highlight')")
 panel=page.get_by_role('region',name='站到站 · 路线查询')
 expect(panel.get_by_role('button',name='规划路线',exact=True)).to_be_enabled(timeout=15000)
 def state():return page.evaluate('JSON.stringify({project:metro.getState().project,undo:metro.getState().canUndo,redo:metro.getState().canRedo,saved:localStorage.getItem("metro-planner.project")})')
 before=state()
 check('saved projects receive readonly tram preview',page.evaluate("testMap.getSource('browse-lines')._data.geojson.features.some(f=>f.properties.name==='光谷有轨电车L3')"))
 def choose(label,name):
  field=panel.get_by_role('combobox',name=label,exact=True);field.fill(name)
  panel.get_by_role('listbox',name=label+'搜索结果').get_by_role('option').filter(has_text=name).first.click()
 def route():
  panel.get_by_role('button',name='规划路线',exact=True).click()
  expect(panel.get_by_label('路线结果')).to_be_visible()
  page.wait_for_function("testMap.getSource('journey-lines')._data.geojson.features.length>0")
 choose('起点站','华中科技园');choose('终点站','洪山广场');route()
 expect(panel.get_by_label('路线结果')).to_contain_text('1 次换乘')
 expect(panel.get_by_label('路线结果')).to_contain_text('有轨电车')
 check('real tram-to-metro route has itinerary and map highlight',page.evaluate('view.getState().journey.journey.transfers')==1)
 check('query preserves project, history and saves',state()==before)
 check('map contains two endpoint markers',page.evaluate("testMap.getSource('journey-stations')._data.geojson.features.filter(f=>f.properties.role).length")==2)
 panel.get_by_role('button',name='交换起点和终点').click()
 expect(panel.get_by_role('combobox',name='起点站',exact=True)).to_have_value('洪山广场')
 page.wait_for_function("testMap.getSource('journey-lines')._data.geojson.features.length===0")
 route();check('swap clears stale overlay and routes in reverse')
 for preference in ['transfers','stops']:
  panel.get_by_label('路线偏好').select_option(preference)
  page.wait_for_function('view.getState().journey===null');route()
 check('both alternative optimization criteria work')
 panel.get_by_label('路线偏好').select_option('fastest');route()
 page.evaluate("testMap.setStyle('https://tiles.openfreemap.org/styles/liberty',{diff:false})")
 page.wait_for_function("testMap.getSource('journey-lines')?._data.geojson.features.length>0")
 check('style reload restores route layers and selected endpoints')
 # Alias search returns the same interchange station, not a duplicate.
 choose('起点站','车轮广场')
 expect(panel.get_by_role('combobox',name='起点站',exact=True)).to_have_value('沌阳大道')
 choose('终点站','得胜港');route()
 expect(panel.get_by_label('路线结果')).to_contain_text('车都有轨电车T1')
 check('tram alias search and direct T1 itinerary')
 choose('起点站','洪山广场');choose('终点站','洪山广场')
 panel.get_by_role('button',name='规划路线',exact=True).click()
 expect(panel).to_contain_text('无需乘车');check('identical endpoints explained')
 panel.get_by_role('combobox',name='起点站',exact=True).fill('不存在的站点')
 panel.get_by_role('button',name='规划路线',exact=True).click()
 expect(panel).to_contain_text('请从搜索结果中选中');check('unselected search text cannot be routed')
 panel.get_by_label('使用线网').select_option('project')
 choose('起点站','private-a');choose('终点站','private-b')
 panel.get_by_role('button',name='规划路线',exact=True).click()
 expect(panel).to_contain_text('当前线网没有可达路线')
 panel.get_by_label('包含在建／规划区间（模拟）').check();route()
 expect(panel).to_contain_text('包含未开通区间');check('planned segments excluded by default and clearly marked in simulation')
 # Editor station action scrolls to query and selects the right endpoint.
 page.evaluate("metro.getState().selectStation('private-a')")
 page.locator('.station-panel').get_by_role('button',name='设为起点').click()
 expect(panel.get_by_role('combobox',name='起点站',exact=True)).to_have_value('private-a')
 check('editor station action selects origin')
 # Import remains one reversible edit and never resets the personal line.
 page.locator('.city-data-info').get_by_role('button',name='把电车加入当前规划').click()
 page.wait_for_function("metro.getState().project.lines['osm-tram-wuhan-l3']")
 check('explicit tram import preserves personal planning line',page.evaluate("!!metro.getState().project.lines['personal-planned']"))
 page.evaluate('metro.getState().undo()')
 check('tram import undo restores exact project',page.evaluate('JSON.stringify(metro.getState().project)')==json.dumps(json.loads(before)['project'],ensure_ascii=False,separators=(',',':')))
 # Undo correctly enables redo; subsequent read-only queries must preserve it too.
 before=state()
 # Readonly drawer selection (actual rendered station circle).
 page.get_by_role('button',name='浏览模式',exact=True).click()
 s=next(s for s in original['stations'].values() if s['name']=='洪山广场')
 page.evaluate('(s)=>void testMap.jumpTo({center:[s.lng,s.lat],zoom:15})',s)
 page.wait_for_function("testMap.queryRenderedFeatures({layers:['metro-readonly-stations']}).some(f=>f.properties.name==='洪山广场')")
 point=page.evaluate('(s)=>testMap.project([s.lng,s.lat])',s);box=page.locator('.map-canvas').bounding_box()
 page.mouse.click(box['x']+point['x'],box['y']+point['y'])
 drawer=page.get_by_role('complementary',name='车站详情');expect(drawer).to_be_visible()
 drawer.get_by_role('button',name='设为终点').click()
 expect(panel.get_by_role('combobox',name='终点站',exact=True)).to_have_value('洪山广场')
 check('map click and readonly drawer select destination')
 drawer.get_by_role('button',name='关闭车站详情').click()
 panel.get_by_label('使用线网').select_option('snapshot');panel.get_by_label('查询城市').select_option('nanjing')
 expect(panel.get_by_role('button',name='规划路线',exact=True)).to_be_enabled()
 choose('起点站','麒麟生态公园');choose('终点站','新街口');route()
 expect(panel).to_contain_text('麒麟有轨电车');check('cross-city query loads Nanjing trams without switching saved project',state()==before)
 panel.get_by_label('查询城市').select_option('wuhan')
 expect(panel.get_by_role('button',name='规划路线',exact=True)).to_be_enabled()
 choose('起点站','华中科技园');choose('终点站','洪山广场');route()
 panel.get_by_label('路线结果').locator('details').first.locator('summary').click()
 page.wait_for_function("!testMap.isMoving()&&testMap.queryRenderedFeatures({layers:['journey-line-highlight']}).length>0")
 check('route highlight is actually rendered within map viewport')
 panel.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844})
 panel.get_by_role('button',name='交换起点和终点').click();route()
 page.wait_for_function("!testMap.isMoving()&&testMap.queryRenderedFeatures({layers:['journey-line-highlight']}).length>0")
 check('mobile query usable without horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
 panel.get_by_role('button',name='清空路线',exact=True).click()
 page.wait_for_function("testMap.getSource('journey-lines')._data.geojson.features.length===0")
 check('clear removes route and endpoints');check('no browser runtime errors',not errors)
 context.close();browser.close()
(OUT/'results.json').write_text(json.dumps({'checks':checks,'runtimeErrors':errors},ensure_ascii=False,indent=2),'utf8')
