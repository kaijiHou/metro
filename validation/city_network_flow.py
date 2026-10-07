"""Exercise editable city networks in the local Chrome, with isolated browser storage."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).parent
DATA = ROOT.parent / 'public' / 'transit'
CATALOG = json.loads((DATA / 'catalog.json').read_text(encoding='utf-8'))['cities']
URL = os.environ.get('METRO_URL', 'http://127.0.0.1:5173/')


def project(page):
    return json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))


def wait_city(page, city):
    page.wait_for_function("id => JSON.parse(localStorage.getItem('metro-planner.project') || '{}').cityId === id", arg=city)
    expect(page.locator('#transit-city')).to_have_value(city)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel=os.environ.get('METRO_BROWSER_CHANNEL') or 'chrome', headless=True,
        args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 950}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle', timeout=60000)
    wait_city(page, 'wuhan')
    expect(page.locator('#transit-city option')).to_have_count(len(CATALOG)+1)
    expect(page.locator('.line-item')).to_have_count(13)
    expect(page.locator('.map-station')).to_have_count(289)
    print('PASS: new browser opens real Wuhan network', flush=True)

    original = project(page)
    station_id = next(s['id'] for s in original['stations'].values() if s['name'] == '洪山广场')
    page.locator('#station-select').select_option(station_id)
    page.locator('.inline-station-edit input').fill('我改的洪山广场')
    page.locator('.inline-station-edit input').blur()
    assert project(page)['stations'][station_id]['name'] == '我改的洪山广场'
    page.get_by_role('button', name='撤销', exact=True).click()
    assert project(page)['stations'][station_id]['name'] == '洪山广场'
    page.get_by_role('button', name='重做', exact=True).click()
    assert project(page)['stations'][station_id]['name'] == '我改的洪山广场'
    page.locator('#transit-city').select_option('shanghai')
    wait_city(page, 'shanghai')
    expect(page.get_by_role('button', name='撤销', exact=True)).to_be_disabled()
    page.locator('#transit-city').select_option('wuhan')
    wait_city(page, 'wuhan')
    assert project(page)['stations'][station_id]['name'] == '我改的洪山广场'
    page.reload(wait_until='domcontentloaded')
    wait_city(page, 'wuhan')
    assert project(page)['stations'][station_id]['name'] == '我改的洪山广场'
    page.get_by_role('button', name='恢复内置原始线路', exact=True).click()
    page.wait_for_function("id => JSON.parse(localStorage.getItem('metro-planner.project')).stations[id].name === '洪山广场'", arg=station_id)
    page.get_by_role('button', name='撤销', exact=True).click()
    assert project(page)['stations'][station_id]['name'] == '我改的洪山广场'
    page.get_by_role('button', name='重置项目', exact=True).click()
    assert project(page)['cityId'] == 'wuhan'
    expect(page.locator('.line-item')).to_have_count(0)
    page.get_by_role('button', name='恢复内置原始线路', exact=True).click()
    expect(page.locator('.line-item')).to_have_count(13)
    page.get_by_role('button', name='撤销', exact=True).click()
    expect(page.locator('.line-item')).to_have_count(0)
    page.get_by_role('button', name='重做', exact=True).click()
    expect(page.locator('.line-item')).to_have_count(13)
    print('PASS: real station rename, undo/redo, per-city save, refresh, original restore and undo', flush=True)

    page.locator('#transit-city').select_option('')
    expect(page.locator('.line-item')).to_have_count(0)
    page.get_by_role('button', name='＋ 新建线路').click()
    page.locator('#line-name').fill('我的自建线')
    page.locator('#line-name').blur()
    page.locator('#transit-city').select_option('wuhan')
    wait_city(page, 'wuhan')
    page.locator('#transit-city').select_option('')
    expect(page.locator('.line-item')).to_have_count(1)
    assert next(iter(project(page)['lines'].values()))['name'] == '我的自建线'

    held = []
    page.route('**/transit/beijing.json', lambda route: held.append(route))
    page.locator('#transit-city').select_option('beijing')
    expect(page.get_by_text('正在载入北京线路…', exact=True)).to_be_visible()
    page.locator('#transit-city').select_option('shanghai')
    wait_city(page, 'shanghai')
    for route in held:
        route.fulfill(path=str(DATA / 'beijing.json'), content_type='application/json')
    page.unroute('**/transit/beijing.json')
    assert project(page)['cityId'] == 'shanghai'
    page.route('**/transit/shenzhen.json', lambda route: route.fulfill(status=503, body='unavailable'))
    page.locator('#transit-city').select_option('shenzhen')
    expect(page.get_by_role('alert')).to_contain_text('当前规划未替换')
    assert project(page)['cityId'] == 'shanghai'
    page.unroute('**/transit/shenzhen.json')
    page.evaluate("localStorage.setItem('metro-planner.city.beijing', '{broken')")
    page.locator('#transit-city').select_option('beijing')
    expect(page.get_by_role('alert')).to_contain_text('JSON')
    assert project(page)['cityId'] == 'shanghai'
    assert page.evaluate("localStorage.getItem('metro-planner.city.beijing')") == '{broken'
    page.evaluate("localStorage.removeItem('metro-planner.city.beijing')")
    print('PASS: custom project retention, rapid switching, failed load and damaged save protection', flush=True)

    for city in CATALOG:
        page.locator('#transit-city').select_option(city['id'])
        wait_city(page, city['id'])
        expect(page.locator('.line-item')).to_have_count(city['lineCount'])
        expect(page.locator('.map-station')).to_have_count(city['stationCount'])
    print(f'PASS: all {len(CATALOG)} cities open with expected line and station counts', flush=True)
    page.locator('#transit-city').select_option('wuhan')
    wait_city(page, 'wuhan')
    page.wait_for_timeout(1600)
    page.screenshot(path=str(ROOT / 'real-wuhan.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 780})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(ROOT / 'real-network-mobile.png'), full_page=True)
    assert not errors, errors
    print('PASS: responsive layout and zero page JavaScript errors', flush=True)
    browser.close()
