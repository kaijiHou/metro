"""Production /metro/ BASE_URL smoke with actual built assets and city files."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    urls=[];errors=[];failed=[]
    page.on('requestfailed',lambda req:failed.append({'url':req.url,'error':req.failure}))
    page.on('request',lambda req:urls.append(req.url) if '/transit/' in req.url else None)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:5174/metro/',wait_until='networkidle',timeout=60000)
    page.wait_for_function("localStorage.getItem('metro-planner.project')&&Object.keys(JSON.parse(localStorage.getItem('metro-planner.project')).lines).length>0")
    page.evaluate("""()=>{const el=document.querySelector('.map-canvas');let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];while(fiber){for(let hook=fiber.memoizedState;hook&&typeof hook==='object';hook=hook.next){const m=hook.memoizedState?.current;if(m?.queryRenderedFeatures){window.testMap=m;return}}fiber=fiber.return}throw Error('Map ref not found')}""")
    try:page.wait_for_function("testMap.getLayer('browse-station-points')")
    except Exception:
        print(json.dumps({'failures':failed,'errors':errors,'style':page.evaluate('testMap.getStyle()')},ensure_ascii=False),flush=True)
        raise
    before=page.evaluate("localStorage.getItem('metro-planner.project')")
    page.get_by_role('button',name='浏览模式',exact=True).click()
    page.evaluate('void testMap.jumpTo({center:[112.98,28.19],zoom:12.5})')
    page.wait_for_function("testMap.getSource('browse-lines')._data.geojson.features.some(f=>f.properties.cityId==='changsha')")
    assert any('/metro/transit/catalog.json' in u for u in urls)
    assert any('/metro/transit/changsha.json' in u for u in urls)
    assert all('/metro/transit/' in u for u in urls),urls
    assert page.evaluate("localStorage.getItem('metro-planner.project')")==before
    assert not errors,errors
    page.screenshot(path=str(ROOT/'validation/phase4-production-preview.png'))
    print(json.dumps({'status':'PASS','base':'/metro/','cityRequests':urls,'projectPreserved':True,'runtimeErrors':errors},ensure_ascii=False),flush=True)
    browser.close()
