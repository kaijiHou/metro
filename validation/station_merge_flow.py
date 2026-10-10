"""Exercise actual marker and label dragging in an isolated browser project."""
import json
from playwright.sync_api import sync_playwright, expect

project = {
    'version': 2, 'name': '拖动合并验证', 'waypoints': {},
    'stations': {
        'east': {'id': 'east', 'name': '武汉火车站东广场', 'lng': 114.42, 'lat': 30.60},
        'main': {'id': 'main', 'name': '武汉火车站', 'lng': 114.40, 'lat': 30.60},
        'next': {'id': 'next', 'name': '下一站', 'lng': 114.44, 'lat': 30.61},
    },
    'lines': {
        'nineteen': {'id': 'nineteen', 'name': '19号线', 'color': '#123456', 'status': 'existing', 'locked': True, 'nodes': [{'type': 'station', 'id': 'east'}, {'type': 'station', 'id': 'next'}]},
        'existing': {'id': 'existing', 'name': '4号线', 'color': '#654321', 'status': 'existing', 'locked': True, 'nodes': [{'type': 'station', 'id': 'main'}]},
    },
}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"if (!localStorage.getItem('metro-planner.project')) localStorage.setItem('metro-planner.project', {json.dumps(json.dumps(project, ensure_ascii=False))}); localStorage.setItem('metro-planner.map-view', JSON.stringify({{center:[114.42,30.60],zoom:14}}))")
    page.goto('http://127.0.0.1:5173/', wait_until='networkidle')
    source = page.locator('.map-station[aria-label="选择站点 武汉火车站东广场"]')
    target = page.locator('.map-station[aria-label="选择站点 武汉火车站"]')
    expect(source).to_have_css('cursor', 'not-allowed')
    source.click()
    expect(page.locator('.map-unlock-station')).to_contain_text('武汉火车站东广场')
    page.get_by_role('button', name='解锁并拖动', exact=True).click()
    expect(source).to_have_css('cursor', 'grab')
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    assert saved['lines']['nineteen']['locked'] is False
    assert saved['lines']['existing']['locked'] is True
    def position(locator):
        b = locator.bounding_box()
        return b['x'] + b['width']/2, b['y'] + b['height']/2
    def drag(a, b):
        page.mouse.move(*a)
        page.mouse.down()
        page.mouse.move(*b, steps=20)
        expect(page.locator('.map-station--merge-target')).to_have_count(1)
        page.mouse.up()
    drag(position(source), position(target))
    expect(source).to_have_count(0)
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    assert saved['lines']['nineteen']['nodes'][0]['id'] == 'main'
    assert saved['stations']['main'] == project['stations']['main']
    page.get_by_role('button', name='撤销', exact=True).click()
    expect(source).to_have_count(1)
    page.locator('#station-label-mode').select_option('all')
    page.wait_for_timeout(3000)
    page.screenshot(path='validation/station-merge-label.png')
    a = position(source)
    # Start on the rendered station name, outside its marker button.
    drag((a[0] + 48, a[1]), position(target))
    expect(source).to_have_count(0)
    page.keyboard.press('Control+s')
    page.reload(wait_until='networkidle')
    expect(source).to_have_count(0)
    saved = json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))
    assert len(saved['stations']) == 2
    assert saved['lines']['nineteen']['nodes'][0]['id'] == 'main'
    assert not errors, errors
    browser.close()
    print('PASS: marker drag, label drag, destination highlight/name/position, locked destination, undo, Ctrl+S and refresh')
