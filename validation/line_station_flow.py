"""Verify station search, line memberships and inserting at the line head."""
import json
import os
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
    expect(page.get_by_role('button', name='＋ 在最前面新增站点', exact=True)).to_be_disabled()
    page.locator('.line-item').filter(has_text='9号线').click()
    search = page.get_by_role('searchbox', name='搜索已有站点')
    search.fill('光谷')
    expect(page.locator('#existing-station option')).to_have_count(2)
    expect(page.locator('#existing-station option').last).to_have_text('光谷广场 — 2 · 11')
    search.fill('不存在的站')
    expect(page.locator('#existing-station')).to_be_disabled()
    expect(page.get_by_role('button', name='加入', exact=True)).to_be_disabled()
    search.fill('11')
    expect(page.locator('#existing-station option')).to_have_count(2)

    page.get_by_role('button', name='＋ 在最前面新增站点', exact=True).click()
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

    search.fill('光谷')
    page.locator('#existing-station').select_option('a')
    page.locator('#existing-station-position').select_option('start')
    page.get_by_role('button', name='加入', exact=True).click()
    expect(page.locator('.node-order li')).to_have_count(4)
    expect(page.locator('.node-order li').first.locator('.station-line-names')).to_have_text('2 · 9 · 11')
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    assert saved['lines']['nine']['nodes'][0]['id'] == 'a'
    for line_id in ('two', 'eleven'):
        assert all(saved['lines'][line_id][key] == value for key, value in project['lines'][line_id].items())
    page.get_by_role('button', name='撤销', exact=True).click()
    expect(page.locator('.node-order li')).to_have_count(3)
    expect(page.locator('#existing-station option').last).to_have_text('光谷广场 — 2 · 11')
    page.set_viewport_size({'width': 390, 'height': 780})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors, errors
    browser.close()
    print('PASS: search by name/line, membership labels, continuous head insertion, existing station at head, undo, locks, mobile, zero page errors')
