"""Failure/retry acceptance with real snapshots and a controlled blank basemap (no network tiles)."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
project=json.loads((ROOT/'public/transit/wuhan.json').read_text(encoding='utf-8'))['project']
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.add_init_script(f"localStorage.setItem('metro-planner.project',{json.dumps(json.dumps(project,ensure_ascii=False))})")
    # No visual claims: controlled background only for request/error lifecycle checks.
    basemap_broken={'value':True}
    def basemap(route):
        if basemap_broken['value']:route.fulfill(status=503,body='basemap offline');return
        route.fulfill(content_type='application/json',body=json.dumps({'version':8,'glyphs':'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf','sources':{},'layers':[{'id':'blank','type':'background','paint':{'background-color':'#edf2f5'}}]}))
    page.route('https://tiles.openfreemap.org/styles/liberty',basemap)
    broken={'catalog':True,'city':True}
    page.route('**/transit/catalog.json',lambda route:route.fulfill(status=503,body='offline') if broken['catalog'] else route.continue_())
    page.route('**/transit/changsha.json',lambda route:route.fulfill(status=404,body='missing') if broken['city'] else route.continue_())
    page.goto('http://127.0.0.1:5173/',wait_until='networkidle')
    page.evaluate("""async()=>{window.metro=(await import('/src/store/metroStore.ts')).useMetroStore;const el=document.querySelector('.map-canvas');let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];while(fiber&&fiber.type?.name!=='MapCanvas')fiber=fiber.return;for(let hook=fiber?.memoizedState;hook;hook=hook.next){const m=hook.memoizedState?.current;if(m?.queryRenderedFeatures){window.testMap=m;break}}window.sentinel=1}""")
    page.wait_for_function("testMap.getLayer('browse-station-points')")
    expect(page.locator('.transit-browse-controls')).to_contain_text('网络底图暂不可用')
    assert page.evaluate("testMap.getLayer('local-network-background')!==undefined")
    basemap_broken['value']=False
    page.get_by_role('button',name='重试底图',exact=True).click()
    page.wait_for_function("testMap.getLayer('blank')&&testMap.getLayer('browse-station-points')")
    print('PASS: failed basemap preserves local transit layers and explicit retry rebuilds them',flush=True)
    before=page.evaluate('JSON.stringify(metro.getState().project)')
    controls=page.locator('.transit-browse-controls')
    expect(controls).to_contain_text('暂时无法加载城市目录')
    broken['catalog']=False
    controls.get_by_role('button',name='重试线网').click()
    expect(controls.get_by_role('button',name='重试线网')).to_have_count(0)
    assert page.evaluate('window.sentinel')==1
    print('PASS: catalog failure retries locally without page reload',flush=True)
    page.locator('.city-networks').get_by_role('button',name='重试',exact=True).click()
    page.wait_for_function("document.querySelector('#transit-city option[value=beijing]')")
    page.get_by_role('button',name='浏览模式',exact=True).click()
    page.evaluate('void testMap.jumpTo({center:[112.98,28.19],zoom:12})')
    expect(controls).to_contain_text('部分城市暂未载入',timeout=10000)
    assert page.evaluate('JSON.stringify(metro.getState().project)')==before
    broken['city']=False
    controls.get_by_role('button',name='重试线网').click()
    page.wait_for_function("testMap.getSource('browse-lines')._data.geojson.features.some(f=>f.properties.cityId==='changsha')")
    assert page.evaluate('JSON.stringify(metro.getState().project)')==before
    print('PASS: city 404 degrades locally and retry restores network without editing project',flush=True)
    # A planning city request started before entering browse must never finish as a switch.
    page.get_by_role('button',name='规划模式',exact=True).click()
    pending=[]
    page.route('**/transit/beijing.json',lambda route:pending.append(route))
    page.locator('#transit-city').select_option('beijing')
    page.wait_for_timeout(400)
    assert pending,'No delayed city request was intercepted'
    page.get_by_role('button',name='浏览模式',exact=True).click()
    for route in pending:
        try:route.fulfill(content_type='application/json',body=(ROOT/'public/transit/beijing.json').read_text(encoding='utf-8'))
        except Exception:pass
    page.wait_for_timeout(400)
    assert page.evaluate('JSON.stringify(metro.getState().project)')==before
    print('PASS: entering browse cancels pending planning city switch',flush=True)
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(ROOT/'validation/phase4-mobile-preview.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    print('PASS: mobile page has no horizontal overflow',flush=True)
    browser.close()
