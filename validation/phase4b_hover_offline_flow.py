"""Hover labels and first-load internet-disconnected footprint test; localhost stays available."""
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5173/'
checks=[]
def check(name,ok=True):
    assert ok,name
    checks.append(name)
    print('PASS:',name,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1600,'height':1000})
    # A completely new browser profile, no warmed HTTP cache or visited map areas.
    # Block public internet, retain the actual localhost app/data service.
    context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE.split('/metro/')[0].rstrip('/')+'/') or r.request.url.startswith(('blob:','data:')) else r.abort())
    page=context.new_page();errors=[];remote=[];record={'active':False}
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:remote.append(r.url) if record['active'] and r.url.startswith('http') and not r.url.startswith(BASE.split('/metro/')[0].rstrip('/')+'/') else None)
    page.goto(BASE,wait_until='networkidle')
    record['active']=True
    page.get_by_role('button',name='我的旅行足迹',exact=True).click()
    expect(page.get_by_role('textbox',name='搜索旅行城市')).to_be_visible()
    page.get_by_role('button',name='市级足迹',exact=True).click()
    page.evaluate("""()=>{let f=document.querySelector('.footprint-map-canvas');f=f[Object.keys(f).find(k=>k.startsWith('__reactFiber'))];while(f){for(let h=f.memoizedState;h&&typeof h==='object';h=h.next){if(h.memoizedState?.current?.queryRenderedFeatures){window.testMap=h.memoizedState.current;return}}f=f.return}throw Error('Map not found')}""")
    page.wait_for_function("testMap.getSource('footprint-cities')&&testMap.queryRenderedFeatures({layers:['footprint-province-names']}).length>10")
    check('fresh profile renders national outlines and province names with all public internet blocked')
    check('style has no external glyph URL',page.evaluate('!testMap.getStyle().glyphs'))

    def hover(lng,lat):
        point=page.evaluate('p=>{const q=testMap.project(p);return {x:q.x,y:q.y}}',[lng,lat])
        rect=page.locator('.footprint-map-canvas').bounding_box()
        page.mouse.move(rect['x']+point['x'],rect['y']+point['y'])

    page.evaluate("testMap.jumpTo({center:[114.4,30.6],zoom:7,padding:{top:0,left:0,right:0,bottom:0}})")
    page.wait_for_function("testMap.queryRenderedFeatures({layers:['footprint-names']}).length>3")
    hover(114.3,30.55)
    tooltip=page.locator('.footprint-city-tooltip')
    expect(tooltip).to_contain_text('武汉市 · 湖北省')
    check('real mouse hover over Wuhan polygon displays city and province')
    page.screenshot(path=str(ROOT/'validation/phase4b-hover-offline-preview.png'))
    first=tooltip.bounding_box()
    hover(114.32,30.55)
    expect(tooltip).to_contain_text('武汉市')
    check('tooltip follows pointer within the same city',tooltip.bounding_box()!=first)
    hover(114.87,30.38)
    expect(tooltip).to_contain_text('鄂州市 · 湖北省')
    check('moving to another actual polygon changes city name')
    page.mouse.move(20,20)
    expect(tooltip).to_have_count(0)
    check('leaving the map removes hover label')
    hover(114.3,30.55)
    expect(tooltip).to_contain_text('武汉市')
    page.evaluate('testMap.setStyle(testMap.getStyle(),{diff:false})')
    page.wait_for_function("testMap.getLayer('footprint-fill')&&testMap.queryRenderedFeatures({layers:['footprint-names']}).length>3")
    expect(tooltip).to_have_count(0)
    hover(114.31,30.55)
    expect(tooltip).to_contain_text('武汉市')
    check('style rebuild clears old popup and restores hover')
    page.get_by_label('筛选省份').select_option('CN043')
    page.wait_for_function("!testMap.isMoving()&&testMap.queryRenderedFeatures({layers:['footprint-names']}).some(f=>f.properties.name==='长沙市')")
    hover(112.95,28.2)
    expect(tooltip).to_contain_text('长沙市 · 湖南省')
    check('another province and its city labels load locally while internet is blocked')
    check('footprint makes zero public internet requests',not remote)
    check('no JavaScript runtime errors',not errors)
    output={'base':BASE,'checks':len(checks),'passed':checks,'remoteRequests':remote,'runtimeErrors':errors,'offlineMethod':'Public internet requests blocked in a fresh profile; localhost remains running. Not a service-worker offline installation.'}
    (ROOT/'validation/phase4b-hover-offline-results.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    context.close();browser.close()
