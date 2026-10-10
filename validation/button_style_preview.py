"""Capture button styling in an isolated desktop and mobile preview."""
import json
from playwright.sync_api import sync_playwright

project = {'version': 2, 'name': '武汉线路规划', 'waypoints': {},
    'stations': {'a': {'id': 'a', 'name': '武汉火车站', 'lng': 114.399258, 'lat': 30.599545}},
    'lines': {'nine': {'id': 'nine', 'name': '9号线', 'color': '#087d91', 'status': 'planned', 'nodes': [{'type': 'station', 'id': 'a'}]}}}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.add_init_script(f"localStorage.setItem('metro-planner.project', {json.dumps(json.dumps(project, ensure_ascii=False))})")
    page.goto('http://127.0.0.1:5173/', wait_until='networkidle')
    page.locator('#station-select').select_option('a')
    page.locator('.station-editor-actions').scroll_into_view_if_needed()
    page.locator('.station-panel').screenshot(path='validation/buttons-station-desktop.png')
    page.screenshot(path='validation/buttons-desktop.png')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('.station-editor-actions').scroll_into_view_if_needed()
    page.screenshot(path='validation/buttons-mobile.png')
    browser.close()
    print('Captured desktop station controls and mobile layout.')
