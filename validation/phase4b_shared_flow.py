"""Shared SQLite acceptance with Chrome + Edge; owns an isolated server and restarts it.

No user browser profiles or real travel files are opened or modified.
"""
import base64,hashlib,json,os,subprocess,time,urllib.request,urllib.error,uuid,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:5175/'
NODE=Path(os.environ['USERPROFILE'])/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
RUN=ROOT/'validation/shared-storage'/str(uuid.uuid4())
RUN.mkdir(parents=True)
(RUN.parent/'README.md').write_text('Isolated synthetic shared-storage runs, SQLite, screenshots, ZIP and logs. No user data. Git ignored.\n','utf8')
(RUN/'README.md').write_text('One isolated synthetic acceptance run. Never use real user data here.\n','utf8')
checks=[];errors=[];process=None
log=(RUN/'server.log').open('a',encoding='utf8')

def check(name,condition=True):
 assert condition,name
 checks.append(name);print('PASS:',name,flush=True)

def api(action='status',body=None,headers=None):
 h=headers if headers is not None else ({'X-Metro-Token':api()['token']} if action!='status' else {})
 if body is not None:h={**h,'Content-Type':'application/json'}
 request=urllib.request.Request(BASE+'api/footprint/'+action,data=None if body is None else json.dumps(body).encode(),headers=h)
 return json.load(urllib.request.urlopen(request,timeout=15))

def start():
 global process
 env={**os.environ,'METRO_DATA_DIR':str(RUN),'PATH':str(NODE.parent)+os.pathsep+os.environ['PATH']}
 process=subprocess.Popen([str(NODE),str(ROOT/'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5175','--strictPort'],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
 deadline=time.monotonic()+35
 while time.monotonic()<deadline:
  if process.poll() is not None:raise RuntimeError('isolated server failed; see '+str(RUN/'server.log'))
  try:api();return
  except (OSError,urllib.error.URLError):time.sleep(.2)
 raise RuntimeError('isolated server did not start')

def stop():
 global process
 if process:
  process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:process.kill();process.wait()
  process=None

def choose(page,name):
 page.get_by_role('textbox',name='搜索旅行城市').fill(name)
 page.locator('.footprint-city-list').get_by_role('button').filter(has_text=name).first.click()
 expect(page.locator('.footprint-detail h2')).to_have_text(name)

try:
 start()
 with sync_playwright() as p:
  args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
  chrome=p.chromium.launch(channel='chrome',headless=True,args=args)
  edge=p.chromium.launch(channel='msedge',headless=True,args=args)
  project=json.loads((ROOT/'public/transit/wuhan.json').read_text('utf8'))['project']
  init=f"if(!localStorage.getItem('metro-planner.project'))localStorage.setItem('metro-planner.project',{json.dumps(json.dumps(project,ensure_ascii=False))})"
  def new_page(browser):
   context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
   context.add_init_script(init)
   # No external requests are necessary for this storage acceptance.
   context.route('**/*',lambda route:route.continue_() if route.request.url.startswith((BASE,'blob:','data:')) else route.abort())
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(BASE,wait_until='networkidle')
   return page
  a=new_page(chrome)
  check('rendered app provides the travel entry',a.get_by_role('button',name='我的旅行足迹',exact=True).count()==1)
  # Seed only this synthetic browser's legacy database, before entering travel.
  image=base64.b64decode(a.evaluate("()=>{const c=document.createElement('canvas');c.width=24;c.height=16;c.getContext('2d').fillRect(0,0,24,16);return c.toDataURL('image/png').split(',')[1]}"))
  a.evaluate("""async b64=>{
   const {footprintDb}=await import('/src/footprint/db.ts'),{FootprintRepository}=await import('/src/footprint/repository.ts');
   const repo=new FootprintRepository(footprintDb,new Set(['ocha2020-CN042120']));
   await repo.saveVisit('ocha2020-CN042120',{status:'visited',note:'旧浏览器备注',visitedDates:['2024-01-01']});
   const blob=new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'image/png'});
   await repo.addPhoto({photoId:'legacy-photo',cityCode:'ocha2020-CN042120',blob,thumbnailBlob:blob,mimeType:'image/png',fileName:'legacy.png',caption:'旧照片',takenAt:'',sortOrder:0,createdAt:new Date().toISOString()});
  }""",base64.b64encode(image).decode())
  a.get_by_role('button',name='我的旅行足迹',exact=True).click()
  expect(a.get_by_role('region',name='足迹保存状态')).to_contain_text('已保存 1 个市级足迹',timeout=20000)
  check('old browser records migrate automatically into the shared file',len(api('visits'))==1)
  choose(a,'武汉市')
  expect(a.get_by_role('textbox',name='城市旅行备注')).to_have_value('旧浏览器备注')
  expect(a.get_by_role('button',name='我的照片 1',exact=True)).to_be_visible()
  b=new_page(edge);b.get_by_role('button',name='我的旅行足迹',exact=True).click()
  expect(b.get_by_role('region',name='足迹保存状态')).to_contain_text('已保存 1 个市级足迹',timeout=20000)
  choose(b,'武汉市')
  expect(b.get_by_role('textbox',name='城市旅行备注')).to_have_value('旧浏览器备注')
  expect(b.get_by_role('button',name='我的照片 1',exact=True)).to_be_visible()
  restored=base64.b64decode(api('photo?id=legacy-photo')['original'])
  check('independent Edge and Chrome share migrated dates, notes and identical photo bytes',restored==image)
  choose(b,'洪湖市');b.locator('.footprint-detail').get_by_role('button',name='标记已到过',exact=True).click()
  expect(a.get_by_label('旅行统计').locator('strong').first).to_contain_text('2',timeout=20000)
  choose(a,'荆州市');expect(a.locator('.footprint-detail')).to_contain_text('由洪湖市点亮整个荆州市')
  check('a second browser edit automatically updates first-browser map/statistics and parent lighting')
  choose(a,'武汉市');a.get_by_role('textbox',name='城市旅行备注').fill('未保存的草稿')
  choose(b,'武汉市');b.get_by_role('textbox',name='城市旅行备注').fill('另一浏览器更新')
  b.get_by_label('新增到访日期').fill('2026-10-20');b.get_by_role('button',name='添加日期',exact=True).click()
  b.get_by_role('button',name='保存日期与备注',exact=True).click()
  expect(a.get_by_label('到访日期 2',exact=True)).to_have_value('2026-10-20',timeout=20000)
  expect(a.get_by_role('textbox',name='城市旅行备注')).to_have_value('未保存的草稿')
  check('cross-browser refresh preserves unsaved note drafts while updating clean fields')
  a.get_by_role('button',name='保存日期与备注',exact=True).click()
  expect(b.get_by_role('textbox',name='城市旅行备注')).to_have_value('未保存的草稿',timeout=20000)
  with a.expect_download() as pending:a.get_by_role('button',name='导出我的全部旅行足迹 ZIP',exact=True).click()
  backup=RUN/'synthetic-backup.zip';pending.value.save_as(backup)
  with zipfile.ZipFile(backup) as archive:
   manifest=json.loads(archive.read('manifest.json'))
   check('shared export ZIP contains actual photos and all city records',len(manifest['visits'])==2 and archive.read(manifest['photos'][0]['path'])==image)
  b.get_by_role('button',name='我的照片 1',exact=True).click()
  b.once('dialog',lambda d:d.accept());b.get_by_role('button',name='删除照片',exact=True).click()
  expect(a.get_by_role('button',name='我的照片 0',exact=True)).to_be_visible(timeout=20000)
  check('photo deletion and cover fallback propagate to another browser',api('photo?id=legacy-photo') is None)
  a.get_by_label('导入旅行足迹ZIP').set_input_files(str(backup))
  expect(a.locator('.footprint-message')).to_contain_text('恢复成功',timeout=20000)
  expect(b.get_by_role('button',name='我的照片 1',exact=True)).to_be_visible(timeout=20000)
  check('ZIP import updates the one shared store and all open browsers')
  stop();start()
  a.reload(wait_until='networkidle');a.get_by_role('button',name='我的旅行足迹',exact=True).click()
  expect(a.get_by_role('region',name='足迹保存状态')).to_contain_text('已保存 1 个市级足迹',timeout=20000)
  choose(a,'武汉市');expect(a.get_by_role('button',name='我的照片 1',exact=True)).to_be_visible()
  check('server restart and browser refresh retain exact photo bytes and notes',base64.b64decode(api('photo?id=legacy-photo')['original'])==image and api('visits')[0] is not None)
  legacy=a.evaluate("async()=>(await import('/src/footprint/db.ts')).footprintDb.visits.toArray()")
  check('legacy browser data is preserved as backup rather than overwritten',len(legacy)==1 and legacy[0]['note']=='旧浏览器备注')
  for action,body,headers in [('visits',None,{}),('visit',{'code':'ocha2020-CN042120','patch':{'status':'unvisited'}},{'X-Metro-Token':api()['token'],'Origin':'https://untrusted.example'})]:
   try:api(action,body,headers);raise AssertionError('unauthorized request accepted')
   except urllib.error.HTTPError as e:assert e.code==403
  try:urllib.request.urlopen(BASE+'validation/shared-storage/'+RUN.name+'/travel.sqlite');raise AssertionError('database exposed')
  except urllib.error.HTTPError as e:assert e.code==403
  check('shared data rejects missing tokens, cross-site writes and direct database downloads')
  a.screenshot(path=str(RUN/'shared-preview.png'))
  check('no browser runtime exceptions',not errors)
  result={'checks':len(checks),'passed':checks,'browsers':['Chrome','Edge'],'photoSHA256':hashlib.sha256(image).hexdigest(),'runtimeErrors':errors,'isolated':True}
  (ROOT/'validation/phase4b-shared-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
  chrome.close();edge.close()
finally:
 stop();log.close()
