import json
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

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

    page.get_by_role('button', name='北京', exact=True).click()
    page.wait_for_function("() => { const raw = localStorage.getItem('metro-planner.map-view'); if (!raw) return false; const view = JSON.parse(raw); return Math.abs(view.center[0] - 116.4074) < 0.1 }")
    page.reload(wait_until='domcontentloaded')
    assert abs(json.loads(page.evaluate("localStorage.getItem('metro-planner.map-view')"))['center'][0] - 116.4074) < 0.1
    page.get_by_role('textbox', name='城市名称').fill('巴黎')
    page.get_by_role('button', name='搜索', exact=True).click()
    page.locator('.city-results button').first.wait_for(timeout=30000)
    page.locator('.city-results button').first.click()
    page.wait_for_function("() => { const raw = localStorage.getItem('metro-planner.map-view'); if (!raw) return false; const view = JSON.parse(raw); return Math.abs(view.center[0] - 2.35) < 1 }")
    page.get_by_role('button', name='武汉', exact=True).click()
    page.wait_for_function("() => { const raw = localStorage.getItem('metro-planner.map-view'); if (!raw) return false; const view = JSON.parse(raw); return Math.abs(view.center[0] - 114.3) < 0.1 }")

    assert page.get_by_text('真实线路数据源暂未内置，可继续进行自主规划。').is_visible()
    assert page.locator('#transit-city').count() == 0

    page.get_by_role('button', name='添加站点', exact=True).click()
    assert '请先选择或创建线路' in page.get_by_role('alert').inner_text()
    page.get_by_role('button', name='＋ 新建线路').click()
    page.get_by_role('button', name='添加站点', exact=True).click()
    canvas = page.locator('.maplibregl-canvas')
    for index, position in enumerate([(350, 300), (500, 400), (650, 300)]):
        canvas.click(position={'x': position[0], 'y': position[1]})
        if index == 0:
            assert page.locator('.node-order li').count() == 1
    page.wait_for_timeout(2000)
    print('counts after click:', page.locator('.map-station').count(), page.locator('.node-order li').count(), 'errors:', errors)
    page.screenshot(path=str(ROOT / 'after-clicks.png'), full_page=True)
    assert page.locator('.map-station').count() == 3
    assert page.locator('.node-order li').count() == 3
    page.wait_for_timeout(5000)
    page.screenshot(path=str(ROOT / 'three-stations.png'), full_page=True)

    page.keyboard.press('Control+z')
    assert page.locator('.node-order li').count() == 2
    page.keyboard.press('Control+y')
    assert page.locator('.node-order li').count() == 3
    page.locator('.node-order .node-select').first.click()
    page.locator('.inline-station-edit input').fill('第一站')
    page.locator('.inline-station-edit input').blur()
    assert '第一站' in page.locator('.node-order li').first.inner_text()
    page.locator('.inline-station-edit input').focus()
    page.locator('.inline-station-edit input').blur()
    page.get_by_role('button', name='撤销', exact=True).click()
    assert '站点 1' in page.locator('.node-order li').first.inner_text()
    page.locator('.inline-station-edit input').focus()
    page.locator('.inline-station-edit input').blur()
    page.get_by_role('button', name='重做', exact=True).click()
    assert '第一站' in page.locator('.node-order li').first.inner_text()

    page.get_by_role('button', name='添加控制点', exact=True).click()
    canvas.click(position={'x': 425, 'y': 350})
    assert page.locator('.map-waypoint').count() == 1
    page.wait_for_timeout(400)
    canvas.click(position={'x': 460, 'y': 373})
    assert page.locator('.map-waypoint').count() == 2
    assert [page.locator('.node-order li').nth(i).locator('.node-symbol--waypoint').count() for i in range(5)] == [0, 1, 1, 0, 0]
    page.keyboard.press('Control+z')
    assert page.locator('.map-waypoint').count() == 1
    page.keyboard.press('Control+y')
    assert page.locator('.map-waypoint').count() == 2
    page.get_by_role('button', name='浏览 / 选择').click()
    page.get_by_role('button', name='从当前线路移除 控制点 1').click()
    page.get_by_role('button', name='从当前线路移除 控制点 1').click()
    assert page.locator('.map-waypoint').count() == 0
    assert page.locator('.node-order li').count() == 3

    first_marker = page.locator('.map-station').first
    first_marker.evaluate("element => { window.__metroMarkerIdentity = element }")
    page.get_by_role('button', name='＋ 插入控制点').first.click()
    canvas.click(position={'x': 425, 'y': 350})
    assert page.locator('.node-order li').count() == 4
    assert page.locator('.map-waypoint').count() == 1
    assert '控制点' in page.locator('.node-order li').nth(1).inner_text()
    page.screenshot(path=str(ROOT / 'waypoint.png'), full_page=True)
    waypoint_marker = page.locator('.map-waypoint').first
    waypoint_marker.evaluate("element => { window.__metroWaypointIdentity = element }")
    page.locator('#line-color').fill('#e33455')
    assert first_marker.evaluate("element => window.__metroMarkerIdentity === element && element.isConnected")
    assert waypoint_marker.evaluate("element => window.__metroWaypointIdentity === element && element.isConnected")
    page.locator('#line-name').fill('测试红线')
    page.locator('#line-name').blur()
    assert first_marker.evaluate("element => window.__metroMarkerIdentity === element && element.isConnected")
    assert waypoint_marker.evaluate("element => window.__metroWaypointIdentity === element && element.isConnected")
    page.locator('#project-name').fill('武汉测试规划')
    page.locator('#project-name').blur()
    page.locator('#station-select').select_option(index=3)
    page.locator('#station-name').fill('第三站')
    page.locator('#station-name').blur()
    assert '第三站' in page.locator('.node-order li').nth(3).inner_text()

    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    waypoint_export_path = ROOT / 'exported-project.json'
    download_info.value.save_as(waypoint_export_path)
    waypoint_before = json.loads(waypoint_export_path.read_text(encoding='utf-8'))
    waypoint_line_id = next(iter(waypoint_before['lines']))
    waypoint_nodes = waypoint_before['lines'][waypoint_line_id]['nodes']
    assert [node['type'] for node in waypoint_nodes] == ['station', 'waypoint', 'station', 'station']
    waypoint_id = waypoint_nodes[1]['id']
    old_waypoint_lng = waypoint_before['waypoints'][waypoint_id]['lng']
    box = waypoint_marker.bounding_box()
    assert box is not None
    center = (box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.move(*center)
    page.mouse.down()
    page.mouse.move(center[0] + 55, center[1] + 35, steps=12)
    page.mouse.up()
    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    download_info.value.save_as(waypoint_export_path)
    waypoint_after = json.loads(waypoint_export_path.read_text(encoding='utf-8'))
    assert waypoint_after['waypoints'][waypoint_id]['lng'] != old_waypoint_lng
    assert waypoint_marker.evaluate("element => window.__metroWaypointIdentity === element && element.isConnected")
    page.get_by_role('button', name='下移 控制点 1').click()
    assert '控制点' in page.locator('.node-order li').nth(2).inner_text()
    page.get_by_role('button', name='上移 控制点 1').click()
    assert '控制点' in page.locator('.node-order li').nth(1).inner_text()
    page.get_by_role('button', name='从当前线路移除 控制点 1').click()
    assert page.locator('.map-waypoint').count() == 0
    assert page.locator('.node-order li').count() == 3

    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    download = download_info.value
    export_path = ROOT / 'exported-project.json'
    download.save_as(export_path)
    before_drag = json.loads(export_path.read_text(encoding='utf-8'))
    line_id = next(iter(before_drag['lines']))
    ids = [node['id'] for node in before_drag['lines'][line_id]['nodes']]
    assert before_drag['version'] == 2 and 'waypoints' in before_drag
    assert 'stationIds' not in before_drag['lines'][line_id]
    assert before_drag['waypoints'] == {}
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
    assert all(any(node == {'type': 'station', 'id': station_id} for node in line['nodes']) for line in shared_project['lines'].values())
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
    page.get_by_role('button', name='取消', exact=True).click()
    assert page.locator('.line-item').count() == 1
    page.get_by_role('button', name='新建项目').click()
    page.get_by_role('textbox', name='新项目名称', exact=True).fill('  ')
    page.get_by_role('button', name='不保存，直接新建', exact=True).click()
    expect(page.get_by_text('请输入新项目名称。', exact=True)).to_be_visible()
    page.get_by_role('textbox', name='新项目名称', exact=True).fill('不保存的新项目')
    page.get_by_role('button', name='不保存，直接新建', exact=True).click()
    assert page.locator('.line-item').count() == 0
    assert json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))['name'] == '不保存的新项目'
    page.locator('input[type=file]').set_input_files(str(export_path))
    expect(page.locator('.line-item')).to_have_count(1)
    expect(page.locator('.map-station')).to_have_count(3)
    page.get_by_role('button', name='新建项目').click()
    with page.expect_download() as saved_before_new:
        page.get_by_role('button', name='保存并新建', exact=True).click()
    saved_before_new.value.save_as(export_path)
    assert len(json.loads(export_path.read_text(encoding='utf-8'))['lines']) == 1
    assert page.locator('.line-item').count() == 0
    page.locator('input[type=file]').set_input_files(str(export_path))
    expect(page.locator('.line-item')).to_have_count(1)
    expect(page.locator('.map-station')).to_have_count(3)
    page.reload(wait_until='domcontentloaded')
    assert page.locator('.line-item').count() == 1
    assert page.locator('.map-station').count() == 3
    assert json.loads(page.evaluate("localStorage.getItem('metro-planner.project')"))['version'] == 2
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
    assert all(not any(node == {'type': 'station', 'id': station_id} for node in line['nodes']) for line in deleted_project['lines'].values())
    page.locator('input[type=file]').set_input_files(str(ROOT / 'fixtures' / 'project-v1.json'))
    expect(page.locator('.line-item')).to_have_count(2)
    expect(page.locator('.map-station--transfer')).to_have_count(1)
    with page.expect_download() as download_info:
        page.get_by_role('button', name='导出 JSON').click()
    download_info.value.save_as(export_path)
    migrated_file = json.loads(export_path.read_text(encoding='utf-8'))
    assert migrated_file['version'] == 2 and migrated_file['waypoints'] == {}
    assert [node['id'] for node in migrated_file['lines']['l1']['nodes']] == ['s1', 's2']
    assert 'stationIds' not in migrated_file['lines']['l1']
    page.locator('input[type=file]').set_input_files(str(ROOT / 'fixtures' / 'project-v2.json'))
    page.locator('.map-waypoint').first.wait_for(timeout=5000)
    assert page.locator('.map-waypoint').count() == 1
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
    assert '本地项目升级或读取失败' in bad_page.get_by_role('alert').inner_text()
    assert bad_page.locator('.line-item').count() == 0
    assert bad_page.evaluate("localStorage.getItem('metro-planner.project.v1')") == '{broken'
    bad_context.close()
    legacy_context = browser.new_context(viewport={'width': 1100, 'height': 760})
    legacy_context.add_init_script("localStorage.setItem('metro-planner.project.v1', JSON.stringify({version:1,name:'旧浏览器项目',stations:{s:{id:'s',name:'旧站',lng:114.3,lat:30.5}},lines:{l:{id:'l',name:'旧线',color:'#2878b9',stationIds:['s']}}}))")
    legacy_page = legacy_context.new_page()
    legacy_page.goto(URL, wait_until='domcontentloaded')
    assert legacy_page.locator('.line-item').count() == 1
    assert json.loads(legacy_page.evaluate("localStorage.getItem('metro-planner.project')"))['version'] == 2
    assert legacy_page.evaluate("localStorage.getItem('metro-planner.project.v1')") is None
    legacy_context.close()
    print('PASS: global city search, saved map position, inline station rename, Ctrl+Z/Y undo/redo, two waypoints inserted by clicking the line, Phase 1.1 and Phase 2 regression, mobile layout')
    print('line id:', line_id, 'station ids:', ids)
    print('drag before/after:', before_drag['stations'][station_id]['lng'], after_drag['stations'][station_id]['lng'])
    print('page errors:', errors)
    browser.close()
