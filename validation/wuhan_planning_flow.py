"""Check saved-project repair, shared interchanges, undo, refresh and rendered station names."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

project = json.loads(Path('public/transit/wuhan.json').read_text(encoding='utf-8'))['project']
for i in range(30):
    line_id = f'wuhan-plan-{i}'
    point_id = f'{line_id}-region-0'
    project['waypoints'][point_id] = {'id':point_id, 'name':'旧区域示意控制点', 'lng':114.3, 'lat':30.5}
    project['lines'][line_id] = {'id':line_id, 'name':f'旧示意{i}', 'color':'#123456', 'status':'planned', 'nodes':[{'type':'waypoint','id':point_id}], 'sourceLineId':'wuhan-corridors-2026-10-14-v1'}
project['lines']['userline'] = {'id':'userline','name':'我的线路','color':'#123456','nodes':[]}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1440,'height':900})
    errors, failures, glyphs = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: glyphs.append((response.url,response.status)) if 'fonts' in response.url or 'glyph' in response.url else None)
    page.add_init_script(f"if (!localStorage.getItem('metro-planner.project')) {{localStorage.setItem('metro-planner.project', {json.dumps(json.dumps(project,ensure_ascii=False))}); localStorage.setItem('metro-planner.map-view',JSON.stringify({{center:[114.277,30.545],zoom:15}}))}}")
    scenarios = {'version':1,'activeId':'default','scenarios':[{'id':'default','name':'默认方案','project':project},{'id':'older','name':'保存的旧方案','project':project}]}
    page.add_init_script(f"if (!localStorage.getItem('metro-planner.scenarios.wuhan')) localStorage.setItem('metro-planner.scenarios.wuhan',{json.dumps(json.dumps(scenarios,ensure_ascii=False))})")
    page.goto('http://127.0.0.1:5173/',wait_until='networkidle')
    expect(page.locator('#line-name')).to_have_value('12号线')
    def saved(): return json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    result = saved()
    assert not any(i.startswith('wuhan-plan-') for i in result['lines'])
    assert not any(i.startswith('wuhan-plan-') for i in result['waypoints'])
    assert 'userline' in result['lines']
    ring = result['lines']['amap-4201-900000078508-0']
    assert ring['closed'] and len(ring['nodes'])==37
    assert len(result['lines']['wuhan-confirmed-10']['nodes'])==13
    assert result['lines']['wuhan-confirmed-11-west']['parentLineId']=='amap-4201-900000073743-0'
    assert len(result['stations'])==len({s['name'] for s in result['stations'].values()})
    assert len([s for s in result['stations'].values() if s['name']=='汉阳站'])==1
    page.keyboard.press('Control+s')
    page.reload(wait_until='networkidle')
    assert saved()==result
    page.locator('#scenario-select').select_option('older')
    page.wait_for_function("!Object.keys(JSON.parse(localStorage.getItem('metro-planner.project')).lines).some(id=>id.startsWith('wuhan-plan-'))")
    assert len(saved()['lines']['amap-4201-900000078508-0']['nodes'])==37
    page.locator('#scenario-select').select_option('default')
    assert saved()==result
    page.screenshot(path='validation/wuhan-confirmed-preview.png')
    print('glyph responses:', glyphs[:12])
    # Inspect the live MapCanvas ref without adding a debug endpoint to production.
    inspect = """() => {
      const el=document.querySelector('.map-canvas');
      let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
      while(fiber && fiber.type?.name!=='MapCanvas') fiber=fiber.return;
      for(let hook=fiber?.memoizedState;hook;hook=hook.next) {
        const map=hook.memoizedState?.current;
        if(map?.queryRenderedFeatures) {window.testMap=map; return {zoom:map.getZoom(),labels:map.queryRenderedFeatures({layers:['metro-station-labels']}).map(f=>f.properties.name),layer:map.getStyle().layers.find(l=>l.id==='metro-station-labels')}}
      }
    }"""
    rendered=page.evaluate(inspect)
    page.evaluate("testMap.jumpTo({center:[114.199,30.535],zoom:14.5})")
    page.wait_for_timeout(3000)
    rendered=page.evaluate(inspect)
    page.screenshot(path='validation/wuhan-confirmed-preview.png')
    print('rendered:',json.dumps(rendered,ensure_ascii=False)[:2200])
    if rendered:
        assert rendered['labels'], 'No station labels rendered at zoom 15'
        assert '港口村' in rendered['labels'], 'Ordinary station label hidden after zooming'
        page.evaluate("testMap.jumpTo({center:[114.15,30.5525],zoom:14})")
        page.wait_for_timeout(2000)
        assert '汉阳站' in page.evaluate("testMap.queryRenderedFeatures({layers:['metro-station-labels']}).map(f=>f.properties.name)")
        page.screenshot(path='validation/wuhan-hanyang-preview.png')
    assert not errors, errors
    # A separate fresh context keeps the original repair in its undo stack.
    context=browser.new_context()
    undo_page=context.new_page()
    undo_page.add_init_script(f"if (!localStorage.getItem('metro-planner.project')) localStorage.setItem('metro-planner.project',{json.dumps(json.dumps(project,ensure_ascii=False))})")
    undo_page.goto('http://127.0.0.1:5173/',wait_until='networkidle')
    undo_page.get_by_role('button',name='撤销',exact=True).click()
    assert 'wuhan-plan-9' in json.loads(undo_page.evaluate("localStorage.getItem('metro-planner.project')"))['lines']
    undo_page.reload(wait_until='networkidle')
    assert 'wuhan-plan-9' in json.loads(undo_page.evaluate("localStorage.getItem('metro-planner.project')"))['lines']
    undo_page.get_by_role('button',name='载入确认线路并清除旧示意',exact=True).click()
    assert 'wuhan-plan-9' not in json.loads(undo_page.evaluate("localStorage.getItem('metro-planner.project')"))['lines']
    browser.close()
    print('PASS: withdrawn 30 corridors, 37-stop loop, verified 10/11, shared IDs, Hanyang, save/refresh and undo/manual reapply')
