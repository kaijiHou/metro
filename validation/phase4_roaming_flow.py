"""Phase 4 roaming/exits browser acceptance. Isolated context; OSM fixtures explicitly mocked."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE=os.environ.get('METRO_TEST_URL','http://127.0.0.1:5173/').rstrip('/')+'/'
ROOT=Path(__file__).resolve().parents[1]
project=json.loads((ROOT/'public/transit/wuhan.json').read_text(encoding='utf-8'))['project']
project['lines']['personal-line']={'id':'personal-line','name':'我的保留线','color':'#123456','nodes':[]}
checks=[]
def check(name, condition=True):
    assert condition, name
    checks.append(name)
    print('PASS:',name,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    requests=[]
    page.on('request',lambda req:requests.append(req.url) if '/transit/' in req.url else None)
    page.add_init_script(f"if(!localStorage.getItem('metro-planner.project'))localStorage.setItem('metro-planner.project',{json.dumps(json.dumps(project,ensure_ascii=False))})")
    # Real basemap, local real city snapshots; deterministic Overpass fixture only.
    mode={'value':'empty','station':None}
    held=[]
    def overpass(route):
        station=mode['station']
        if mode['value']=='slow':held.append(route);return
        if mode['value']=='error':route.fulfill(status=503,body='unavailable');return
        elements=[]
        if mode['value']=='available':
            elements=[{'type':'relation','id':9,'tags':{'public_transport':'stop_area','name':station['name']},'members':[{'type':'node','ref':123}]},{'type':'node','id':123,'lat':station['lat']+.0001,'lon':station['lng']+.0001,'tags':{'railway':'subway_entrance','ref':'A1','wheelchair':'yes'}}]
        route.fulfill(content_type='application/json',body=json.dumps({'elements':elements}))
    page.route('https://overpass-api.de/api/interpreter',overpass)
    page.goto(BASE,wait_until='networkidle',timeout=60000)
    page.evaluate("""async()=>{window.metro=(await import('/src/store/metroStore.ts')).useMetroStore;window.view=(await import('/src/store/viewStore.ts')).useViewStore;
      const el=document.querySelector('.map-canvas');let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
      while(fiber&&fiber.type?.name!=='MapCanvas')fiber=fiber.return;
      for(let hook=fiber?.memoizedState;hook;hook=hook.next){const candidate=hook.memoizedState?.current;if(candidate?.queryRenderedFeatures){window.testMap=candidate;break}}
    }""")
    page.wait_for_function("testMap.getLayer('browse-station-points')")
    # Make a reversible edit and save two scenarios to test persistence/history isolation.
    page.evaluate("metro.getState().renameProject('漫游验收项目');metro.getState().createScenario('验收方案',metro.getState().project);metro.getState().renameProject('漫游前最后一次修改')")
    def state():
        return page.evaluate("""()=>{const s=metro.getState();return JSON.stringify({project:s.project,scenario:s.activeScenarioId,scenarios:s.scenarios,undo:s.canUndo,redo:s.canRedo,saved:localStorage.getItem('metro-planner.project'),scenarioData:localStorage.getItem('metro-planner.scenarios.wuhan')})}""")
    before=state()
    page.get_by_role('button',name='浏览模式',exact=True).click()
    expect(page.get_by_role('button',name='新建项目',exact=True)).to_have_count(0)
    page.evaluate("void testMap.jumpTo({center:[114.30,30.58],zoom:12.5})")
    page.wait_for_timeout(1100)
    check('browse removes editor DOM markers',page.locator('.map-station:visible').count()==0)
    check('Wuhan planning data remains drawn',page.evaluate("testMap.getSource('metro-lines')._data.geojson.features.length>0"))
    # Own current project station click.
    def click_station(background=False, city='wuhan'):
        if page.get_by_role('button',name='关闭车站详情').count():page.get_by_role('button',name='关闭车站详情').click()
        source='browse-stations' if background else 'metro-station-labels'
        station=page.evaluate("""({source,city})=>{const features=testMap.getSource(source)._data.geojson.features;const f=features.find(f=>(!f.properties.cityId||f.properties.cityId===city)&&testMap.getBounds().contains(f.geometry.coordinates));return {name:f.properties.name,lng:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]}}""",{'source':source,'city':city})
        mode['station']=station
        page.evaluate('(s)=>void testMap.jumpTo({center:[s.lng,s.lat],zoom:15})',station)
        layer='browse-station-points' if background else 'metro-readonly-stations'
        page.wait_for_function("({layer,name})=>testMap.queryRenderedFeatures({layers:[layer]}).some(f=>f.properties.name===name)",arg={'layer':layer,'name':station['name']})
        point=page.evaluate('(s)=>testMap.project([s.lng,s.lat])',station)
        box=page.locator('.map-canvas').bounding_box()
        page.mouse.click(box['x']+point['x'],box['y']+point['y'])
        expect(page.get_by_role('complementary',name='车站详情')).to_be_visible()
        return station
    click_station()
    expect(page.get_by_role('complementary',name='车站详情')).to_contain_text('暂无可靠出口数据')
    check('Wuhan station missing data is honest')
    page.get_by_role('button',name='关闭车站详情').click()
    page.evaluate("void testMap.jumpTo({center:[112.98,28.19],zoom:12.5})")
    page.wait_for_function("testMap.getSource('browse-stations')._data.geojson.features.some(f=>f.properties.cityId==='changsha')")
    check('pan to Changsha loads network without city selection',state()==before)
    mode['value']='available'
    station=click_station(True,'changsha')
    drawer=page.get_by_role('complementary',name='车站详情')
    expect(drawer).to_contain_text('长沙')
    expect(drawer).to_contain_text('A1 出入口')
    expect(drawer).to_contain_text('出口方向暂未收录')
    expect(drawer).to_contain_text('候选关联，待核实')
    check('Changsha station identity and relation-member fixture exits')
    expect(drawer.locator('.exit-card')).to_have_count(1)
    drawer.get_by_role('button',name='在地图定位此出口').click()
    page.wait_for_function("testMap.getZoom()>16.9")
    check('exit locates actual provided coordinate',page.evaluate("testMap.getSource('station-exits')._data.geojson.features.length")==1)
    mode['value']='error'
    drawer.get_by_role('button',name='重新查询出口').click()
    expect(drawer).to_contain_text('503',timeout=10000)
    mode['value']='empty'
    drawer.get_by_role('button',name='重新查询出口').click()
    expect(drawer).to_contain_text('暂无可靠出口数据',timeout=10000)
    check('retry bypasses cache and recovers from failure')
    page.get_by_role('button',name='关闭车站详情').click()
    check('close clears exit source',page.evaluate("testMap.getSource('station-exits')._data.geojson.features.length")==0)
    page.evaluate("void testMap.fitBounds([[112.5,27.7],[115.0,31.0]],{duration:0,padding:10})")
    page.wait_for_function("testMap.getSource('browse-stations')._data.geojson.features.some(f=>f.properties.cityId==='changsha')")
    check('combined viewport shows Wuhan and Changsha',page.evaluate("testMap.getSource('metro-lines')._data.geojson.features.length>0&&testMap.getSource('browse-lines')._data.geojson.features.some(f=>f.properties.cityId==='changsha')"))
    cached_count=sum('/changsha.json' in r for r in requests)
    page.evaluate("void testMap.jumpTo({center:[114.3,30.58],zoom:12});void testMap.jumpTo({center:[112.98,28.19],zoom:12});void testMap.jumpTo({center:[114.3,30.58],zoom:12})")
    page.wait_for_timeout(1000)
    check('rapid panning ends at latest viewport',not page.evaluate("testMap.getSource('browse-lines')._data.geojson.features.some(f=>f.properties.cityId==='changsha')"))
    page.evaluate("void testMap.jumpTo({center:[112.98,28.19],zoom:12})")
    page.wait_for_function("testMap.getSource('browse-lines')._data.geojson.features.some(f=>f.properties.cityId==='changsha')")
    check('returning to city uses cache',sum('/changsha.json' in r for r in requests)==cached_count)
    # City picker in presentation only navigates; returning to planning must not reopen this city.
    page.locator('#transit-city').select_option('changsha')
    page.wait_for_timeout(1400)
    check('browse city picker does not switch project',state()==before)
    page.locator('#transit-city').select_option('')
    check('custom project entry cannot replace project while browsing',state()==before)
    page.get_by_role('checkbox',name='仅看已建成线路').check()
    page.get_by_role('button',name='返回我的规划城市').click()
    page.wait_for_function("testMap.getSource('browse-lines')._data.geojson.features.some(f=>f.properties.cityId==='wuhan')")
    check('existing-only avoids current city duplication',page.evaluate("testMap.getSource('metro-lines')._data.geojson.features.length")==0)
    page.get_by_role('checkbox',name='全国线网自动展示').uncheck()
    page.wait_for_timeout(800)
    check('auto-off removes national overview but retains selected existing city',page.evaluate("testMap.getSource('browse-cities')._data.geojson.features.length===0&&testMap.getSource('browse-lines')._data.geojson.features.every(f=>f.properties.cityId==='wuhan')"))
    page.get_by_role('checkbox',name='全国线网自动展示').check()
    page.get_by_role('checkbox',name='仅看已建成线路').uncheck()
    # Station race: make first station request slow, then immediately click another via live map events.
    original_station=station
    page.evaluate("void testMap.jumpTo({center:[112.98,28.19],zoom:12.5})")
    page.wait_for_function("testMap.getSource('browse-stations')._data.geojson.features.some(f=>f.properties.cityId==='changsha')")
    station=click_station(True,'changsha')
    mode['value']='available'
    pair=page.evaluate("testMap.getSource('browse-stations')._data.geojson.features.filter(f=>f.properties.cityId==='changsha').slice(2,4).map(f=>({name:f.properties.name,lng:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]}))")
    mode['value']='slow'
    for index,s in enumerate(pair):
        mode['station']=s
        page.evaluate("s=>void testMap.jumpTo({center:[s.lng,s.lat],zoom:16})",s)
        page.wait_for_function("name=>testMap.queryRenderedFeatures({layers:['browse-station-points']}).some(f=>f.properties.name===name)",arg=s['name'])
        page.evaluate("s=>{const point=testMap.project([s.lng,s.lat]);testMap.fire('click',{point,lngLat:testMap.unproject(point),originalEvent:{button:0}})}",s)
        expect(page.get_by_role('complementary',name='车站详情').locator('h2')).to_have_text(s['name'])
        if index==0:
            page.wait_for_timeout(1600)
            mode['value']='available'
    expect(page.get_by_role('complementary',name='车站详情')).to_contain_text('A1 出入口',timeout=10000)
    for route in held:
        try:route.fulfill(content_type='application/json',body=json.dumps({'elements':[]}))
        except Exception:pass # Canceled old station request may no longer have a transport.
    page.wait_for_timeout(400)
    selected=page.evaluate('view.getState().station')
    check('rapid station changes keep latest city/station identity',selected['name']==pair[-1]['name'] and selected['cityId']=='changsha')
    check('old delayed station response cannot overwrite latest exits',page.evaluate("Math.abs(testMap.getSource('station-exits')._data.geojson.features[0].geometry.coordinates[0]-view.getState().station.lng-.0001)<.00001"))
    page.screenshot(path=str(ROOT/'validation/phase4-roaming-preview.png'))
    # Recreate sources from a fresh style on the same map instance.
    page.evaluate("void testMap.setStyle({version:8,glyphs:testMap.getStyle().glyphs,sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':'#edf2f5'}}]})")
    page.wait_for_function("testMap.getLayer('station-exit-points')&&testMap.getSource('station-exits')._data.geojson.features.length===1")
    check('style reload restores isolated network/exit layers')
    page.get_by_role('button',name='规划模式',exact=True).click()
    page.wait_for_timeout(500)
    check('planning project/scenario/history/persistence unchanged',state()==before)
    check('planning editor markers restored',page.locator('.map-station:visible').count()>0)
    page.get_by_role('button',name='撤销',exact=True).click()
    check('undo restores actual last user edit',page.evaluate('metro.getState().project.name')=='漫游验收项目')
    page.get_by_role('button',name='重做',exact=True).click()
    check('redo restores edited project',page.evaluate('metro.getState().project.name')=='漫游前最后一次修改')
    check('no browser runtime exceptions',not errors)
    print(json.dumps({'checks':len(checks),'passed':checks,'errors':errors},ensure_ascii=False),flush=True)
    browser.close()
