"""Verify station search, line memberships and inserting at the line head."""
import json
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

project = {
    'version': 2, 'name': '首站与搜索验证', 'waypoints': {},
    'stations': {
        'a': {'id': 'a', 'name': '光谷广场', 'lng': 114.4, 'lat': 30.5},
        'b': {'id': 'b', 'name': '财经政法大学', 'lng': 114.3, 'lat': 30.55},
    },
    'lines': {
        'two': {'id': 'two', 'name': '2号线', 'color': '#ff0000', 'status': 'existing', 'locked': True, 'nodes': [{'type': 'station', 'id': 'a'}]},
        'nine': {'id': 'nine', 'name': '9号线', 'color': '#00aa00', 'status': 'planned', 'nodes': [{'type': 'station', 'id': 'b'}]},
        'eleven': {'id': 'eleven', 'name': '11号线', 'color': '#0000ff', 'status': 'existing', 'locked': True, 'nodes': [{'type': 'station', 'id': 'a'}]},
    },
}

with sync_playwright() as p:
    browser = p.chromium.launch(channel=os.environ.get('METRO_BROWSER_CHANNEL', 'chrome'), headless=True,
        args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('metro-planner.project', {json.dumps(json.dumps(project, ensure_ascii=False))})")
    page.goto(os.environ.get('METRO_URL', 'http://127.0.0.1:4173/'), wait_until='domcontentloaded')
    expect(page.get_by_role('button', name='去地图放新站', exact=True)).to_be_disabled()
    page.locator('.line-item').filter(has_text='9号线').click()
    page.get_by_role('button', name='使用已有站点', exact=True).click()
    search = page.get_by_role('searchbox', name='搜索站名或线路编号')
    search.fill('光谷')
    expect(page.locator('.station-result')).to_have_count(1)
    expect(page.locator('.station-result-lines')).to_have_text('2 · 11')
    search.fill('不存在的站')
    expect(page.locator('.station-result')).to_have_count(0)
    expect(page.get_by_text('没找到这个站，试试名称中的几个字。', exact=True)).to_be_visible()
    search.fill('11')
    expect(page.locator('.station-result')).to_have_count(1)

    page.get_by_role('button', name='新建站点', exact=True).click()
    page.get_by_role('button', name='线路开头', exact=True).click()
    page.get_by_role('button', name='去地图放新站', exact=True).click()
    for count in (2, 3):
        point = page.evaluate("""() => {
            const c = document.querySelector('.maplibregl-canvas'), r = c.getBoundingClientRect();
            for (let y = r.top + 120; y < r.bottom - 100; y += 80)
                for (let x = r.left + 100; x < r.right - 100; x += 80)
                    if (document.elementFromPoint(x, y) === c) return {x, y};
        }""")
        page.mouse.click(point['x'], point['y'])
        expect(page.locator('.node-order li')).to_have_count(count)
    page.get_by_role('button', name='完成添加', exact=True).click()
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    ids = [node['id'] for node in saved['lines']['nine']['nodes']]
    assert saved['stations'][ids[0]]['name'] == '站点 4'
    assert saved['stations'][ids[1]]['name'] == '站点 3'
    assert ids[2] == 'b'

    page.get_by_role('button', name='去地图放新站', exact=True).click()
    page.get_by_role('button', name='加入站点 光谷广场', exact=True).click()
    expect(page.locator('.node-order li')).to_have_count(4)
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    assert saved['lines']['nine']['nodes'][0]['id'] == 'a'
    assert len(saved['stations']) == 4
    expect(page.locator('.line-item--active')).to_contain_text('9号线')
    page.get_by_role('button', name='加入站点 光谷广场', exact=True).click()
    expect(page.locator('.node-order li')).to_have_count(4)
    page.get_by_role('button', name='撤销', exact=True).click()
    expect(page.locator('.node-order li')).to_have_count(3)

    page.get_by_role('button', name='使用已有站点', exact=True).click()
    search.fill('光谷')
    expect(page.get_by_role('button', name='线路开头', exact=True)).to_have_attribute('aria-pressed', 'true')
    page.locator('.station-result[data-station-id="a"]').click()
    expect(page.locator('.node-order li')).to_have_count(4)
    expect(page.locator('.node-order li').first.locator('.station-line-names')).to_have_text('2 · 9 · 11')
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    assert saved['lines']['nine']['nodes'][0]['id'] == 'a'
    for line_id in ('two', 'eleven'):
        assert all(saved['lines'][line_id][key] == value for key, value in project['lines'][line_id].items())
    page.get_by_role('button', name='撤销', exact=True).click()
    expect(page.locator('.node-order li')).to_have_count(3)
    expect(page.locator('.station-result-lines')).to_have_text('2 · 11')
    expect(page.locator('.station-result[data-station-id="a"]')).to_be_enabled()
    page.locator('.station-result[data-station-id="a"]').click()
    expect(page.locator('.station-result[data-station-id="a"]')).to_be_disabled()
    expect(page.locator('.station-result-lines')).to_have_text('2 · 9 · 11')
    page.set_viewport_size({'width': 390, 'height': 780})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.get_by_role('button', name='撤销', exact=True).click()
    page.locator('.station-add-panel').screenshot(path=str(Path(__file__).parent / 'station-add-simple.png'))
    page.set_viewport_size({'width': 1440, 'height': 900})
    page.get_by_role('button', name='新建站点', exact=True).click()
    page.get_by_role('button', name='线路末尾', exact=True).click()
    page.get_by_role('button', name='去地图放新站', exact=True).click()
    page.get_by_role('button', name='加入站点 光谷广场', exact=True).click()
    expect(page.locator('.node-order li')).to_have_count(4)
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    assert saved['lines']['nine']['nodes'][-1]['id'] == 'a'
    assert len(saved['stations']) == 4
    expect(page.locator('.line-item--active')).to_contain_text('9号线')
    page.get_by_role('button', name='使用已有站点', exact=True).click()
    expect(page.get_by_role('button', name='添加站点', exact=True)).to_have_attribute('aria-pressed', 'false')
    page.get_by_role('button', name='展示模式', exact=True).click()
    expect(page.locator('.map-area')).to_have_class('map-area map-area--presentation')
    page.get_by_role('button', name='从这里新建支线', exact=True).click()
    expect(page.locator('.map-area')).to_have_class('map-area map-area--adding')
    expect(page.get_by_role('button', name='完成添加', exact=True)).to_be_visible()
    assert page.locator('.maplibregl-canvas').evaluate('element => getComputedStyle(element).cursor') == 'crosshair'
    point = page.evaluate("""() => {
        const c = document.querySelector('.maplibregl-canvas'), r = c.getBoundingClientRect();
        for (let y = r.top + 120; y < r.bottom - 100; y += 80)
            for (let x = r.left + 100; x < r.right - 100; x += 80)
                if (document.elementFromPoint(x, y) === c) return {x, y};
    }""")
    page.mouse.click(point['x'], point['y'])
    expect(page.locator('.node-order li')).to_have_count(2)
    page.get_by_role('button', name='加入站点 财经政法大学', exact=True).click()
    expect(page.locator('.node-order li')).to_have_count(3)
    expect(page.locator('.line-item')).to_have_count(3)
    expect(page.locator('.line-branch-item')).to_have_count(1)
    expect(page.locator('.line-branch-item')).to_contain_text('属于9号线')
    page.locator('#line-name').fill('欢乐谷支线')
    page.keyboard.press('Control+s')
    expect(page.get_by_text('当前方案已保存到本机浏览器。', exact=True)).to_be_visible()
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    branch = next(line for line in saved['lines'].values() if line.get('parentLineId') == 'nine')
    assert branch['name'] == '欢乐谷支线'
    assert len(branch['nodes']) == 3
    assert not errors, errors
    browser.close()
    print('PASS: simple station panel, search, memberships, head/tail map connections, no duplicates or line switches, undo, locks, mobile, zero page errors')
