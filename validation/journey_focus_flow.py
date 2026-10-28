"""Route focus regression. Use a Vite test server with isolated METRO_DATA_DIR."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from shared_storage_test_guard import check_storage

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'validation/journeys'
BASE=os.environ.get('METRO_TEST_URL','http://127.0.0.1:5175/').rstrip('/')+'/'
check_storage(BASE,True)
project=json.loads((ROOT/'public/transit/wuhan.json').read_text('utf8'))['project']
project['stations']['isolated']={'id':'isolated','name':'我的孤立站','lng':114.25,'lat':30.5}
checks=[]
def check(name,ok=True):
 assert ok,name
 checks.append(name);print('PASS:',name,flush=True)

with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome',headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('localStorage.setItem("metro-planner.project",'+json.dumps(json.dumps(project,ensure_ascii=False))+')')
 page.goto(BASE,wait_until='networkidle',timeout=60000)
 page.evaluate("""async()=>{window.metro=(await import('/src/store/metroStore.ts')).useMetroStore;window.view=(await import('/src/store/viewStore.ts')).useViewStore;
 const el=document.querySelector('.map-canvas');let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];while(f&&f.type?.name!=='MapCanvas')f=f.return;
 for(let h=f?.memoizedState;h;h=h.next){if(h.memoizedState?.current?.queryRenderedFeatures){window.testMap=h.memoizedState.current;break}}} """)
 page.wait_for_function("testMap.getLayer('journey-line-highlight')")
 page.evaluate("metro.getState().setStationLabelMode('interchanges');view.getState().setAutoNetworks(false)")
 panel=page.get_by_role('region',name='站到站 · 路线查询')
 expect(panel.get_by_role('button',name='规划路线',exact=True)).to_be_enabled()
 before=page.evaluate('JSON.stringify({p:metro.getState().project,saved:localStorage.getItem("metro-planner.project")})')
 baseline=page.evaluate("Object.fromEntries(testMap.getStyle().layers.filter(l=>/^(metro-|browse-|station-exit-)/.test(l.id)||/(?:^|_)transit_rail(?:_|$)/.test(l.id)).map(l=>[l.id,testMap.getFilter(l.id)??null]))")
 marker_count=page.locator('.map-station').count()
 def choose(label,name):
  panel.get_by_role('combobox',name=label,exact=True).fill(name)
  panel.get_by_role('listbox',name=label+'搜索结果').get_by_role('option').filter(has_text=name).first.click()
 def focused():
  return page.evaluate("Object.entries(testMap.getStyle().layers).filter(([,l])=>/^(metro-|browse-|station-exit-)/.test(l.id)||/(?:^|_)transit_rail(?:_|$)/.test(l.id)).every(([,l])=>JSON.stringify(testMap.getFilter(l.id))===JSON.stringify(['==',['literal',true],false]))")
 def recommend():
  panel.get_by_role('button',name='规划路线',exact=True).click()
  page.wait_for_function("!testMap.isMoving()&&testMap.queryRenderedFeatures({layers:['journey-line-highlight']}).length>0")
 choose('起点站','常青城');choose('终点站','百步亭花园路');recommend()
 expect(panel.get_by_label('路线结果')).to_contain_text('2 次换乘')
 check('requested Changqingcheng to Baibuting route contains exactly three service legs',page.evaluate('view.getState().journey.journey.legs.length')==3)
 check('all unrelated application networks, labels, exits and basemap transit tracks hidden',focused())
 check('background features no longer render',page.evaluate("testMap.queryRenderedFeatures({layers:['metro-lines','metro-construction-lines','metro-station-labels','browse-network-lines','browse-station-names']}).length")==0)
 check('all editor station and waypoint markers hidden',page.locator('.map-station,.map-waypoint').count()==0)
 expect(page.get_by_role('img',name='起点站：常青城')).to_be_visible()
 expect(page.get_by_role('img',name='终点站：百步亭花园路')).to_be_visible()
 mapbox=page.locator('.map-canvas').bounding_box()
 for marker in page.locator('.journey-map-endpoint').all():
  box=marker.bounding_box();assert box['x']>=mapbox['x'] and box['x']+box['width']<=mapbox['x']+mapbox['width'];assert box['y']>=mapbox['y'] and box['y']+box['height']<=mapbox['y']+mapbox['height']
 check('green and red station cards fully inside map viewport')
 legend=page.get_by_label('线路名称与颜色')
 expect(legend).to_contain_text('2号线');expect(legend).to_contain_text('3号线');expect(legend).to_contain_text('阳逻线');expect(legend).not_to_contain_text('10号线')
 check('legend lists only the recommended services')
 page.screenshot(path=str(OUT/'focus-desktop.png'),full_page=True)
 old=page.evaluate('JSON.stringify(view.getState().journey.journey)')
 panel.get_by_role('button',name='交换起点和终点').click();panel.get_by_label('路线偏好').select_option('transfers')
 check('draft endpoint and preference changes keep the recommendation until replacement or clear',focused() and page.evaluate('JSON.stringify(view.getState().journey.journey)')==old)
 panel.get_by_label('使用线网').select_option('project');choose('起点站','我的孤立站');choose('终点站','洪山广场')
 panel.get_by_role('button',name='规划路线',exact=True).click();expect(panel).to_contain_text('地图保留上次推荐')
 check('unreachable new query does not restore unrelated lines',focused())
 page.get_by_role('button',name='浏览模式',exact=True).click();page.get_by_role('button',name='规划模式',exact=True).click()
 page.evaluate('view.getState().setAutoNetworks(true)');page.wait_for_timeout(600)
 check('mode changes and background loading do not exit route focus',focused() and page.locator('.map-station').count()==0)
 page.evaluate("testMap.setStyle('https://tiles.openfreemap.org/styles/liberty',{diff:false})")
 page.wait_for_function("testMap.getLayer('journey-line-highlight')&&testMap.queryRenderedFeatures({layers:['journey-line-highlight']}).length>0")
 check('focus, halos and station cards survive style reload',focused() and page.locator('.journey-map-endpoint').count()==2)
 page.set_viewport_size({'width':390,'height':844})
 panel.get_by_label('使用线网').select_option('snapshot');panel.get_by_label('查询城市').select_option('wuhan')
 expect(panel.get_by_role('button',name='规划路线',exact=True)).to_be_enabled()
 choose('起点站','常青城');choose('终点站','百步亭花园路');recommend()
 check('mobile route remains focused with two endpoint cards',focused() and page.locator('.journey-map-endpoint').count()==2 and page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 page.screenshot(path=str(OUT/'focus-mobile.png'),full_page=True)
 page.get_by_role('button',name='清空路线，恢复线网').click()
 page.wait_for_function("view.getState().journey===null&&testMap.getSource('journey-lines')._data.geojson.features.length===0")
 restored=page.evaluate("Object.fromEntries(Object.keys("+json.dumps(baseline)+").map(id=>[id,testMap.getFilter(id)??null]))")
 check('clear restores every original layer filter exactly',restored==baseline)
 check('clear removes endpoint cards and restores editor markers',page.locator('.journey-map-endpoint').count()==0 and page.locator('.map-station').count()==marker_count)
 check('original label preferences, project and persisted project stay unchanged',page.evaluate('metro.getState().stationLabelMode')=='interchanges' and page.evaluate('JSON.stringify({p:metro.getState().project,saved:localStorage.getItem("metro-planner.project")})')==before)
 check('no browser runtime errors',not errors)
 browser.close()
(OUT/'focus-results.json').write_text(json.dumps({'checks':checks,'runtimeErrors':errors},ensure_ascii=False,indent=2),'utf8')
