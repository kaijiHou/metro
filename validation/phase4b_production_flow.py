"""Actual /metro/ production footprint UI/static asset/Dexie/ZIP smoke, isolated browser."""
import json,base64
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome',headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1600,'height':1100},accept_downloads=True)
 urls=[];errors=[]
 page.on('request',lambda req:urls.append(req.url) if '/footprint/' in req.url else None)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5174/metro/',wait_until='networkidle',timeout=60000)
 page.wait_for_function("localStorage.getItem('metro-planner.project')&&Object.keys(JSON.parse(localStorage.getItem('metro-planner.project')).lines).length>0")
 project=page.evaluate("localStorage.getItem('metro-planner.project')")
 page.get_by_role('button',name='我的旅行足迹',exact=True).click()
 page.wait_for_function("document.querySelector('.footprint-stats')")
 page.get_by_role('textbox',name='搜索旅行城市').fill('武汉市')
 page.locator('.footprint-city-list').get_by_role('button').filter(has_text='武汉市').click()
 detail=page.get_by_role('complementary',name='城市旅行详情')
 expect(detail).to_contain_text('系统默认 · 武汉 · 黄鹤楼')
 page.wait_for_function("document.querySelector('.footprint-main-photo img')?.naturalWidth>100")
 assert '/metro/footprint/wuhan-yellow-crane.jpg' in detail.locator('.footprint-main-photo img').get_attribute('src')
 detail.get_by_role('button',name='标记已到过',exact=True).click()
 expect(detail.get_by_role('button',name='取消点亮')).to_be_visible()
 png=base64.b64decode(page.evaluate("()=>{const c=document.createElement('canvas');c.width=30;c.height=20;return c.toDataURL('image/png').split(',')[1]}"))
 detail.get_by_label('上传城市照片').set_input_files({'name':'production-synthetic.png','mimeType':'image/png','buffer':png})
 expect(detail.get_by_role('button',name='我的照片 1')).to_be_visible()
 with page.expect_download() as download:page.get_by_role('button',name='导出我的全部旅行足迹 ZIP',exact=True).click()
 path=ROOT/'validation/phase4b-production.zip';download.value.save_as(path)
 assert path.stat().st_size>len(png)
 page.get_by_role('button',name='轨道交通地图',exact=True).click()
 assert page.evaluate("localStorage.getItem('metro-planner.project')")==project
 assert any('/metro/footprint/catalog.json' in u for u in urls)
 assert any('/metro/footprint/CN042.json' in u for u in urls)
 assert any('/metro/footprint/province-outlines.json' in u for u in urls)
 assert all('/metro/footprint/' in u for u in urls)
 assert not errors,errors
 result={'status':'PASS','base':'/metro/','footprintRequests':urls,'photoUploadAndZip':True,'metroProjectUnchanged':True,'runtimeErrors':errors}
 (ROOT/'validation/phase4b-production-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(result,ensure_ascii=False),flush=True)
 browser.close()
