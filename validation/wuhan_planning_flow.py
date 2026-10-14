"""Validate the first-load Wuhan corridor import in isolated browser storage."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

project = json.loads(Path('public/transit/wuhan.json').read_text(encoding='utf-8'))['project']
project['stations']['old'] = {'id':'old','name':'旧9号线专用站','lng':114.3,'lat':30.5}
project['lines']['oldnine'] = {'id':'oldnine','name':'9号线','color':'#123456','nodes':[{'type':'station','id':'old'}]}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':1440,'height':900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"if (!localStorage.getItem('metro-planner.project')) localStorage.setItem('metro-planner.project', {json.dumps(json.dumps(project,ensure_ascii=False))})")
    page.goto('http://127.0.0.1:5173/',wait_until='networkidle')
    expect(page.locator('.line-item')).to_have_count(35)
    expect(page.locator('.line-branch-item')).to_have_count(8)
    expect(page.locator('#line-name')).to_have_value('9号线')
    def saved():
        return json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    result = saved()
    assert 'oldnine' not in result['lines'] and 'old' not in result['stations']
    assert len(result['stations']) == 289
    assert len({s['name'] for s in result['stations'].values()}) == 289
    guanggu = next(s['id'] for s in result['stations'].values() if s['name']=='光谷广场')
    assert {'type':'station','id':guanggu} in result['lines']['wuhan-plan-9']['nodes']
    for line in result['lines'].values():
        for node in line['nodes']:
            assert node['id'] in result['stations' if node['type']=='station' else 'waypoints']
    expect(page.get_by_text('规划示意，非2024—2035批复方案的完整还原。', exact=False)).to_be_visible()
    page.locator('.line-item').filter(has_text='10号线').click()
    page.locator('#line-name').fill('10号线我的修改')
    page.locator('#line-name').press('Enter')
    page.keyboard.press('Control+s')
    page.reload(wait_until='networkidle')
    assert saved()['lines']['wuhan-plan-10']['name']=='10号线我的修改'
    expect(page.locator('.line-item')).to_have_count(35)
    # A second isolated page exercises undo immediately after import and refresh.
    page.locator('#scenario-new-name').fill('现状对照保留')
    page.get_by_role('button', name='新建方案', exact=True).click()
    expect(page.locator('.line-item')).to_have_count(13)
    assert not any(line.get('sourceLineId','').startswith('wuhan-corridors-') for line in saved()['lines'].values())
    context = browser.new_context(viewport={'width':1440,'height':900})
    undo_page = context.new_page()
    undo_page.add_init_script(f"if (!localStorage.getItem('metro-planner.project')) localStorage.setItem('metro-planner.project', {json.dumps(json.dumps(project,ensure_ascii=False))})")
    undo_page.goto('http://127.0.0.1:5173/',wait_until='networkidle')
    expect(undo_page.locator('.line-item')).to_have_count(35)
    undo_page.get_by_role('button',name='撤销',exact=True).click()
    expect(undo_page.locator('.line-item')).to_have_count(14)
    undo_page.reload(wait_until='networkidle')
    expect(undo_page.locator('.line-item')).to_have_count(14)
    undo_page.get_by_role('button',name='加入规划示意并替换9号线',exact=True).click()
    expect(undo_page.locator('.line-item')).to_have_count(35)
    page.screenshot(path='validation/wuhan-planning-preview.png')
    assert not errors, errors
    browser.close()
    print('PASS: 22 corridors + 8 extensions, 289 unique shared stations, old nine replacement, save/refresh/edit preservation, other scenarios preserved, undo survives refresh, manual reapply')
