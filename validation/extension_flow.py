"""Verify an existing independently saved extension can become one continuous line."""
import json
import os
from playwright.sync_api import expect, sync_playwright

nodes = lambda start, end: [{'type': 'station', 'id': f's{i}'} for i in range(start, end + 1)]
project = {
    'version': 2, 'name': '9号线延伸验证', 'waypoints': {},
    'stations': {f's{i}': {'id': f's{i}', 'name': '欢乐谷' if i == 19 else f'站{i}', 'lng': 114 + i / 100, 'lat': 30.5} for i in range(1, 24)},
    'lines': {
        'nine': {'id': 'nine', 'name': '9号线', 'color': '#123456', 'status': 'planned', 'nodes': nodes(1, 19)},
        'part': {'id': 'part', 'name': '欢乐谷支线', 'color': '#654321', 'status': 'planned', 'nodes': nodes(19, 23)},
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
    page.locator('.line-item').filter(has_text='欢乐谷支线').click()
    merge = page.get_by_role('button', name='并入9号线，作为连续延伸', exact=True)
    merge.click()
    expect(page.locator('.line-item')).to_have_count(1)
    expect(page.locator('.line-item')).to_contain_text('23 站')
    expect(page.locator('.node-order li')).to_have_count(23)
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    assert saved['lines']['nine']['nodes'] == nodes(1, 23)
    assert len(saved['stations']) == 23
    page.get_by_role('button', name='撤销', exact=True).click()
    expect(page.locator('.line-item')).to_have_count(2)
    page.locator('.line-item').filter(has_text='欢乐谷支线').click()
    page.get_by_role('button', name='将欢乐谷支线归入9号线支线', exact=True).click()
    expect(page.locator('.line-item')).to_have_count(1)
    expect(page.locator('.line-item')).to_contain_text('23 站')
    expect(page.locator('.line-branch-item')).to_contain_text('9号线支线')
    expect(page.locator('.line-branch-item')).to_contain_text('本段5站')
    merge.click()
    expect(page.locator('.line-branch-item')).to_have_count(0)
    expect(page.locator('.node-order li')).to_have_count(23)
    page.keyboard.press('Control+s')
    expect(page.get_by_text('当前方案已保存到本机浏览器。', exact=True)).to_be_visible()
    assert not errors, errors
    browser.close()
    print('PASS: old extension merge, 19+5-1=23 stations, one continuous line, undo, grouped branch name/total, Ctrl+S, zero page errors')
