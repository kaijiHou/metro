import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
URL = os.environ.get('METRO_URL', 'http://127.0.0.1:5173/')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='chrome', headless=True, args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    page = context.new_page()
    errors = []
    failed = []
    pbf = []
    console = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: failed.append((request.url, request.failure)))
    page.on('response', lambda response: pbf.append((response.url, response.status)) if '.pbf' in response.url else (failed.append((response.url, response.status)) if response.status >= 400 else None))
    page.on('console', lambda message: console.append((message.type, message.text)) if message.type in ('error', 'warning') else None)
    page.goto(URL, wait_until='domcontentloaded')
    page.locator('.maplibregl-canvas').wait_for(timeout=20000)
    page.wait_for_timeout(30000)
    page.screenshot(path=str(ROOT / 'initial.png'), full_page=True)
    print('title:', page.title())
    print('map canvas:', page.locator('.maplibregl-canvas').count())
    print('map error:', errors)
    print('failed requests:', failed[:10])
    print('vector tile/font responses:', len(pbf))
    print('console warnings/errors:', console[:10])
    browser.close()
