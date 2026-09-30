import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
URL = os.environ.get('METRO_URL', 'http://127.0.0.1:5173/')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel=os.environ.get('METRO_BROWSER_CHANNEL') or None, headless=True, args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept('恢复测试' if dialog.type == 'prompt' else None))
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle', timeout=60000)
    page.locator('.maplibregl-canvas').wait_for()

    page.get_by_role('button', name='添加站点', exact=True).click()
    assert '请先选择或创建线路' in page.get_by_role('alert').inner_text()
    page.get_by_role('button', name='＋ 新建线路').click()
    page.get_by_role('button', name='添加站点', exact=True).click()
    canvas = page.locator('.maplibregl-canvas')
    for index, position in enumerate([(350, 300), (500, 400), (650, 300)]):
        canvas.click(position={'x': position[0], 'y': position[1]})
        if index == 0:
            assert page.locator('.station-order li').count() == 1
    page.wait_for_timeout(2000)
    print('counts after click:', page.locator('.map-station').count(), page.locator('.station-order li').count(), 'errors:', errors)
    page.screenshot(path=str(ROOT / 'after-clicks.png'), full_page=True)
    assert page.locator('.map-station').count() == 3
    assert page.locator('.station-order li').count() == 3
    page.wait_for_timeout(5000)
    page.screenshot(path=str(ROOT / 'three-stations.png'), full_page=True)

    first_marker = page.locator('.map-station').first
    first_marker.evaluate("element => { window.__metroMarkerIdentity = element }")
    page.locator('#line-color').fill('#e33455')
    assert first_marker.evaluate("element => window.__metroMarkerIdentity === element && element.isConnected")
    page.locator('#line-name').fill('测试红线')
    page.locator('#line-name').blur()
    assert first_marker.evaluate("element => window.__metroMarkerIdentity === element && element.isConnected")
    page.locator('#project-name').fill('武汉测试规划')
    page.locator('#project-name').blur()
    page.locator('#station-name').fill('第三站')
    page.locator('#station-name').blur()
    assert page.locator('.station-order li').nth(2).inner_text().startswith('第三站')

    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    download = download_info.value
    export_path = ROOT / 'exported-project.json'
    download.save_as(export_path)
    before_drag = json.loads(export_path.read_text(encoding='utf-8'))
    line_id = next(iter(before_drag['lines']))
    ids = before_drag['lines'][line_id]['stationIds']
    assert len(ids) == 3 and before_drag['lines'][line_id]['color'] == '#e33455'
    assert before_drag['lines'][line_id]['name'] == '测试红线'
    assert before_drag['name'] == '武汉测试规划'

    marker = page.locator('.map-station').nth(0)
    box = marker.bounding_box()
    assert box is not None
    center = (box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.move(*center)
    page.mouse.down()
    page.mouse.move(center[0] + 65, center[1] + 45, steps=12)
    page.mouse.up()
    page.wait_for_timeout(500)
    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    download_info.value.save_as(export_path)
    after_drag = json.loads(export_path.read_text(encoding='utf-8'))
    station_id = ids[0]
    assert after_drag['stations'][station_id]['lng'] != before_drag['stations'][station_id]['lng']

    page.get_by_role('button', name='＋ 新建线路').click()
    page.locator('#existing-station').select_option(station_id)
    page.get_by_role('button', name='加入', exact=True).click()
    assert page.locator('.map-station--transfer').count() == 1
    page.locator('#existing-station').select_option(ids[2])
    page.get_by_role('button', name='加入', exact=True).click()
    assert page.locator('.map-station--transfer').count() == 2
    assert page.locator('.line-item').count() == 2
    marker = page.locator('.map-station').nth(0)
    box = marker.bounding_box()
    assert box is not None
    center = (box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.move(*center)
    page.mouse.down()
    page.mouse.move(center[0] + 35, center[1] + 30, steps=10)
    page.mouse.up()
    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    download_info.value.save_as(export_path)
    shared_project = json.loads(export_path.read_text(encoding='utf-8'))
    assert len(shared_project['lines']) == 2
    assert all(station_id in line['stationIds'] for line in shared_project['lines'].values())
    assert shared_project['stations'][station_id]['lng'] != after_drag['stations'][station_id]['lng']
    page.screenshot(path=str(ROOT / 'transfer.png'), full_page=True)
    page.get_by_role('button', name='删除这条线路').click()
    assert page.locator('.line-item').count() == 1
    assert page.locator('.map-station').count() == 3

    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    download_info.value.save_as(export_path)
    final_project = json.loads(export_path.read_text(encoding='utf-8'))
    assert len(final_project['lines']) == 1 and len(final_project['stations']) == 3

    page.get_by_role('button', name='新建项目').click()
    assert page.locator('.line-item').count() == 0
    page.locator('input[type=file]').set_input_files(str(export_path))
    assert page.locator('.line-item').count() == 1
    assert page.locator('.map-station').count() == 3
    page.reload(wait_until='domcontentloaded')
    assert page.locator('.line-item').count() == 1
    assert page.locator('.map-station').count() == 3
    assert json.loads(page.evaluate("localStorage.getItem('metro-planner.project.v1')"))['version'] == 1
    page.locator('input[type=file]').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{"version":99}'})
    assert 'JSON' in page.get_by_role('alert').inner_text() or '版本' in page.get_by_role('alert').inner_text()
    assert page.locator('.line-item').count() == 1
    page.locator('.maplibregl-canvas').click(position={'x': 800, 'y': 600})
    assert page.locator('.map-station').count() == 3
    page.locator('#station-select').select_option(station_id)
    page.get_by_role('button', name='删除这个站点').click()
    assert page.locator('.map-station').count() == 2
    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    download_info.value.save_as(export_path)
    deleted_project = json.loads(export_path.read_text(encoding='utf-8'))
    assert station_id not in deleted_project['stations']
    assert all(station_id not in line['stationIds'] for line in deleted_project['lines'].values())
    page.locator('.maplibregl-ctrl-zoom-in').click()
    page.set_viewport_size({'width': 1100, 'height': 760})
    assert page.locator('.map-canvas').bounding_box()['width'] > 500
    page.get_by_role('button', name='重置项目').click()
    assert page.locator('.line-item').count() == 0
    page.set_viewport_size({'width': 390, 'height': 780})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(ROOT / 'mobile.png'), full_page=True)
    assert not errors, errors
    bad_context = browser.new_context(viewport={'width': 1100, 'height': 760})
    bad_context.add_init_script("localStorage.setItem('metro-planner.project.v1', '{broken')")
    bad_page = bad_context.new_page()
    bad_page.goto(URL, wait_until='domcontentloaded')
    bad_page.wait_for_load_state('networkidle', timeout=60000)
    assert '本地保存的数据无效' in bad_page.get_by_role('alert').inner_text()
    assert bad_page.locator('.line-item').count() == 0
    bad_context.close()
    print('PASS: empty-line guard, three stations, ordered line, marker identity after line edits, color/name edit, drag, shared transfer, shared drag, delete line, export/import, localStorage reload, invalid import, invalid localStorage, delete station, zoom/resize, reset, mobile layout')
    print('line id:', line_id, 'station ids:', ids)
    print('drag before/after:', before_drag['stations'][station_id]['lng'], after_drag['stations'][station_id]['lng'])
    print('page errors:', errors)
    browser.close()
