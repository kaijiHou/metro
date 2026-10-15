# 测试报告

## Phase 4 第一批：全国漫游与站点出口（2026-10-15）

本批实现需求文档允许的最小完整范围。基线 `c708d4eb742a3587b155b808a4bb5fbde6763c87`，main。**不是整个Phase 4完成：市级足迹、相册、Dexie/IndexedDB、默认城市照片、ZIP备份均未实现/NOT RUN。** GPS只有设计文档。

| 检查 | 实际结果 |
|---|---|
| npm ci | 成功，Node v24.19.0；存在原有ESLint 9.36.0停止支持提示 |
| npm run lint | 成功，0错误/0警告 |
| npm test | 94 PASS，0 FAIL |
| npm run build | 默认根路径成功；另运行 --base=/metro/ 成功；保留MapLibre大包>500KB提示 |
| npm audit --audit-level=moderate | 0漏洞（validation/phase4-audit.json），没有将审计警告写为PASS |
| Playwright全国漫游/出口 | 23个检查通过，Chrome独立profile，真实底图与原始城市快照；出口内容使用明示模拟响应 |
| Playwright错误/重试/手机 | 4个检查通过：catalog失败本地重试、城市404重试、切浏览取消在途编辑城市切换、390px无横向溢出 |
| 生产子路径 | /metro/真实生产构建打开，catalog/长沙快照都从/metro/transit加载，项目不变，0运行异常 |
| 真实OSM查询 | FAILED：一次长沙附近请求返回HTTP 504，13.78秒；不声称真实出口覆盖验收通过 |
| git diff --check | 通过；无快照改动、无用户照片、新增原始边界不发布 |
| GitHub CI | 推送后检查对应HEAD实际运行，不能用本地通过代替；交付消息给出远端运行结果 |

### 已验证的保护与功能

武汉保留个人线路和独立方案→浏览→地图到长沙自动加载→两城同屏→快速返回→缓存命中；浏览中的城市下拉和自主规划入口都不会替换项目。回规划后项目JSON、activeScenarioId、方案列表、持久化字符串、canUndo/canRedo相同，实际撤销/重做恢复用户最后的改名。

浏览中无编辑DOM Marker，站点通过GeoJSON点击；点击武汉/长沙车站城市关联正确。模拟的OSM关系成员出口正确显示编号/坐标/候选置信/无方向提示；非成员附近入口不会被收录（单元测试）。错误503后显式重试能绕过缓存，再回空状态；换站取消旧查询，延迟旧响应不覆盖新站，关闭清空出口源；同Map样式重载重建独立图层。

生产子路径第一次检查遇到底图初始化超时，重试通过；底图仍依赖第三方网络。安装依赖第一次因自有Vite占用Windows原生模块报EPERM，停服后npm ci成功；系统Node20.12.1触发传递依赖引擎提示，最终采用本机已有Node24.19.0验证，CI同步为24。没有新增依赖，没有升级锁文件。默认根构建和子路径构建均实际执行。

### 五城快照回归

与基线JSON内容逐项完全一致（工作区CRLF与Git对象LF不作字节一致声明）：

| 城市 | 线路/支段 | 站点 |
|---|---:|---:|
| 武汉 | 13 | 289 |
| 长沙 | 7 | 151 |
| 北京 | 27 | 410 |
| 上海 | 24 | 418 |
| 广州 | 23 | 332 |

原58城文件、项目v2/v1升级、Scenario、Station/Waypoint、锁定/Undo/Redo单元回归保持；Windows启动器未修改，本地Vite已重新启动。没有把规划线改作运营线。既有高德快照再分发许可仍是原有待复核风险；没有擅自删除或新增抓取。

### 复现与产物

- `validation/phase4_roaming_flow.py`：开发服务器5173；23个漫游/出口检查。
- `validation/phase4_failure_flow.py`：开发服务器5173；只在请求/错误测试中使用明示空白底图，不据此宣称视觉底图覆盖。
- `validation/phase4_production_flow.py`：先构建 --base=/metro/，预览5174 --base=/metro/；验证生产BASE_URL。
- 脚本使用项目现有Python/Playwright/Chrome独立浏览空间，不接触用户浏览数据。机器结果：validation/phase4-results.json、phase4-snapshot-counts.json、phase4-audit.json、phase4-live-osm.json。
- 完整本地输出：validation/phase4-*.log；截图：phase4-roaming-preview.png、phase4-production-preview.png、phase4-mobile-preview.png。日志/截图按既有规则不提交。

未交付项、边界资料门槛见TRAVEL_FOOTPRINT.md；出口局限见STATION_EXITS.md；下一阶段设计见NAVIGATION_ROADMAP.md。


## 展示站名与10号线远期走廊（2026-10-14）

- 展示模式显示站名并隐藏圆圈与控制点；切出后保留编辑模式筛选。
- 10号线仅增量补入常福方向至汉口的西段与阳逻方向的东向走廊，有公开依据的换乘共用原站，未确定区域为控制点，没有伪造完整站名表。
- 旧v4方案中的修改与删除保留，其他远期示意不重新导入。
- lint、86项测试、生产构建与隔离浏览器的展示切换、标签渲染、实线、保存刷新、撤销及旧方案升级PASS。

## 武汉确认延长段第二批（2026-10-14）

- 3号线二期六座新站（含新增车城南路）+沌阳大道衔接；6号线三期两座新站+东风公司衔接；阳逻线后湖大道—新春—中一路；11号线三期汉阳站—黄金口。
- 站名采用官方公开工程资料，区分工程名与最终运营名；车城南路位置仅为官方路口附近估计位置，其余新增站为公开地图坐标。
- 增量升级旧v3方案，保留原10/11/12路线、站名和坐标修改，不重复生成同名换乘站，支持一步撤销、保存、刷新及各方案分别升级。
- lint、85项单元测试、生产构建及隔离浏览器流程PASS；地图所有地铁线路与图例为实线，保留文字状态。

## 武汉确认线路补充与旧示意撤回（2026-10-14）

- 撤回旧22条走廊及8个延伸示意，只清理已知生成线路/来源及其孤立控制点，保留共用节点和其他用户线路。
- 12号线正式37站闭环，所有区间按用户偏好统一实线，14座未开通站仍保留在建状态；11号线四期8个节点（六座新站+两端衔接站）归入原11号线；10号线确认区段13站标为在建。汉阳站为独立真实站记录。
- 复用同名换乘站和原站ID；保存、刷新不覆盖用户修改。每个打开的旧武汉方案分别迁移，撤销后刷新不重加，提供手动重试。
- lint、83项单元测试、生产构建PASS；浏览器验证旧30条示意清理、环线、换乘共享ID、Ctrl+S、刷新、旧方案切换、撤销后刷新与手动重加PASS。
- 实际放大地图验证普通站“港口村”和“汉阳站”标签渲染；14级以上站名不被底图碰撞避让隐藏。截图本地保存在validation。官方站序及地图级坐标来源见 `docs/WUHAN_PLANNING.md`。

## 按钮样式统一（2026-10-10）

- 为侧栏、顶部工具栏和项目弹窗设置统一按钮基础样式，补齐方案管理、规划控制等原生灰色按钮；主要操作青绿色，删除操作淡红色描边，并提供禁用、悬停、键盘焦点样式。
- 站点编辑的新建支线与删除站点按钮改为独立整行排列。地图站点圆圈和地图原生控件不套用业务按钮样式。
- lint、生产构建 PASS。运行 `validation/button_style_preview.py` 并人工查看桌面站点按钮与 390 px 手机截图，排版正常；截图仅保留本地 validation 目录，不提交。

## 真实线路站点拖不动的提示与解锁（2026-10-10）

- 真实线路默认锁定时，站点圆圈改为禁止拖动光标；点选后地图直接显示“站名 · 已锁定”和“解锁并拖动”按钮。点锁定站名也提供相同入口，阻止地图平移造成误导。
- 解锁按钮一次解锁所有保护该源站的线路，保留线路状态与其他站所属线路的锁定；支持一步撤销。目标站可保持锁定。
- lint、80 项单元测试、生产构建 PASS。隔离浏览器验证锁定源站→点圆圈→地图解锁→圆圈拖动合并→撤销→站名拖动合并→Ctrl+S→刷新恢复 PASS。

## 拖动站点合并与旧支线入口（2026-10-10）

- 支持拖动规划站的圆点或地图站名，放到另一站的圆点或站名上合并；目标站名、坐标与 ID 保留，全部源站引用接到目标站，控制点保留。目标站可属于已锁定现状线路，源站必须解锁；相邻重复节点折叠，不相邻重复经过目标站时拒绝合并。
- 合并作为一步自动保存、支持撤销与重做。旧独立支线提供直接可见的归属按钮，不静默猜测所属主线。
- `npm test`：79 项 PASS；lint、生产构建 PASS。
- `validation/station_merge_flow.py`：真实圆点拖动、站名拖动、目标高亮、锁定目标、站名与坐标保留、撤销、Ctrl+S 与刷新恢复 PASS。使用隔离浏览器，不改动用户浏览器方案。
- `validation/extension_flow.py`：旧支线归属、组站数、连续延伸、撤销及保存回归 PASS。

## 站名字号与对比度

- 日期：2026-10-09。规划站名改为粗体，随缩放由 15 px 增至 20 px，采用深色文字和 2.5 px 白色描边；底图轨道站名采用同样样式，公交及机场标签保持原样。
- `npm run lint`、`npm run build`：PASS。生产预览地图与站点渲染、页面 JavaScript 异常检查：PASS。已查看 `validation/station-names-large.png` 确认“光谷广场”粗体字号及描边，截图不提交。
- 字体文件请求返回 200。首次基于浏览器响应事件的断言：FAILED（未捕获到对应请求事件）；改用实际渲染检查并查看截图后：PASS。

## 支线名称、全线站数与连续延伸合并

- 日期：2026-10-09。新支线名称带所属线路及起点，旧支段归属后名称同步更新；主线路列表统计包含各支段的唯一站点和节点，支段明确标记“本段”站数。
- 增加“并入所属线路，作为连续延伸”：在首末端衔接时按方向连接节点，衔接站去重、保留全部站点及控制点，删除冗余支段记录，一步撤销恢复。锁定线路、环线、途中分叉或重复经过节点不执行连续合并。
- `npm run lint`、`npm test`（77/77，新增 2 项）、`npm run build`：PASS。生产预览 `validation/extension_flow.py`：PASS，覆盖 19+5−1=23 站合并、撤销、旧支段归属及全线数量、Ctrl+S，页面 JavaScript 异常为 0。

## 支线归属、添加模式与 Ctrl+S

- 日期：2026-10-09。新支线通过 `parentLineId` 归入当前主线路，采用同一地图颜色与线路标注；线路数、换乘数按主线路去重，主线路统计包含支线。旧独立支线可手动选择“支线归属”。主线删除会带上所属支段，支段可单独删除，保留站点并支持撤销。
- 修复展示模式与编辑模式不一致：开始添加后自动返回编辑，画布用十字光标，地图点击及点站接入生效。
- `Ctrl+S` / `Cmd+S` 保存当前方案到浏览器，并先提交输入框编辑，显示成功或失败提示；不增加撤销步骤。
- `npm run lint`、`npm test`（75/75，新增 2 项综合回归）、`npm run build`：PASS。生产预览的 `validation/line_station_flow.py`：PASS，新增展示模式下创建支线、十字光标、空白及已有站添加、嵌套归属、输入框内 Ctrl+S 和实际浏览器存储检查，页面 JavaScript 异常为 0。
- `validation/browser_flow.py`：PASS，完整编辑回归及页面异常检查通过。复制主线路同时复制所属支段，并更新新支段的归属 ID，单元回归通过；保留现状的重置操作同时保留必要的所属主线路，避免产生无效归属。

## 添加站点界面整理与地图点站接入

- 日期：2026-10-09。添加站点区改为分组选择来源与开头/末尾，搜索结果直接显示可点击站名及线路，移除搜索后再选择下拉框的步骤。添加模式下，点击地图已有站接入当前线路，点击空白处新建；站点不参与拖动，避免误操作。重复点击不会重复加入，也不会切换到被点击站点原有线路。
- `npm run lint`、`npm test`（73/73）、`npm run build`：PASS。生产预览的 `validation/line_station_flow.py`：PASS，覆盖头尾地图点站接入、搜索、已加入提示、撤销与锁定保护；`validation/browser_flow.py`：PASS，完整编辑回归通过。两项流程均无页面 JavaScript 异常。
- 390 px 手机布局无横向溢出，已查看 `validation/station-add-simple.png` 确认来源、位置和搜索结果层次清楚；截图不提交版本控制。

## 首站插入、站点搜索与所属线路

- 日期：2026-10-09。节点列表旁增加“在最前面新增站点”，连续点击地图按头插法新增；已有站点可按站名或线路编号搜索，选择加入首端或末端。候选站和节点列表显示所属线路，按线路号排序并随项目修改、撤销更新。
- `npm run lint`、`npm test`（73/73）、`npm run build`：PASS。生产预览上的 `validation/line_station_flow.py`：PASS，覆盖搜索与无匹配、2/9/11 线路标注、连续头插、已有站点加入首端、撤销、现状保护、390 px 布局及零页面异常。
- 验证脚本首次对比原始 fixture 与补齐默认字段后的线路出现断言误报；改为逐项核对原始字段后通过，默认字段兼容行为保留。

## 当前线路就地新增站点

- 日期：2026-10-09。节点列表下方新增“继续新增站点”和“完成添加”，无需滚动到顶部；新增站点接在当前线路末尾，锁定线路禁用入口。
- `npm run lint`、`npm run build`：PASS。生产预览 Chrome 定向验证：PASS，覆盖就地进入添加模式、连续新增两个站点、退出添加及锁定保护。

## Phase 3 城市轨道交通规划沙盘

- 日期：2026-10-08；开发基线：`1ade3c0`。保留 58 个内置城市线网，武汉真实线路及支段由 13 条保持为 13 条；全城合计 397 条。现状线路载入后默认 `existing`、锁定、显示，用户规划叠加保存；原始 `public/transit/` 快照未删除。
- 新增状态、显隐、锁定及恢复，复制现状线为规划线、首尾延长、从站点建支线，线路与城市统计、站名显示模式、可折叠图例及每城市最多 5 个独立方案。控制点待插入索引失效和孤点精准清理的回归继续通过。测距属于低优先级 P3，本次未实现。
- `npm ci`：PASS；首次运行时生产预览占用 Rollup 原生文件而报 `EPERM`，停止该预览后重跑通过。Node 20.12.1 对两个间接依赖提示引擎版本较旧。
- `npm run lint`：PASS。`npm test`：73/73 PASS，比基线增加 11 项。`npm run build`：PASS。`npm audit --audit-level=moderate`：PASS，0 个已知漏洞。
- 本机 Chrome 对生产预览运行 `validation/browser_flow.py`：PASS；新建项目、站点与控制点、撤销/重做、导入导出、展示模式、移动端和页面异常检查通过，JavaScript 异常为 0。
- `validation/city_network_flow.py`：PASS；58 城逐一核对、武汉 13 条现状线、六个重点城市的锁定/显隐/规划操作、方案切换及保存，JavaScript 异常为 0。
- GitHub Actions CI：PASS；[运行 #37734744790](https://github.com/kaijiHou/metro/actions/runs/37734744790) 对实现提交 `f204791` 完成安装、Lint、73 项测试与生产构建。
- 已知限制：第三方线网快照获取于 2026-10-07，不保证此后新增或调整的线路；现有方案与新版内置快照线路 ID 不同时会提示核对，目前不自动合并；按站点坐标连线而非实际轨道走向；浏览器方案容量受 localStorage 限制；MapLibre 构建包仍超过 500 kB 提示。

## 展示模式线路名称

- 日期：2026-10-08。使用既有线路 GeoJSON 的 name 添加沿线文字标注，展示模式增加全部线路的颜色与名称图例；名称编辑及撤销同步更新。
- `npm run lint`、`npm run build`、`validation/browser_flow.py`：PASS。武汉 13 条线路图例数量、名称修改及撤销、390 px 手机布局检查通过；页面 JavaScript 异常为 0。
- 已查看 `validation/presentation-line-names.png` 确认沿线名称及图例可见，站点圆圈仍隐藏。截图不提交版本控制。

## 线路展示模式

- 日期：2026-10-08。地图右上角增加“展示模式 / 返回编辑”，展示时隐藏站点 Marker、控制点 Marker、站名及编辑提示，所有线路使用统一的未选中样式；地图平移与缩放保留，地图点击不触发编辑。
- `npm run lint`、`npm run build`：PASS。`validation/browser_flow.py`：PASS，新增隐藏/恢复站点与控制点、展示时点击地图不改项目的检查，原有编辑回归通过且页面 JavaScript 异常为 0。
- 武汉 289 个站点隐藏与恢复、390 px 移动端入口可见性：PASS。已查看 `validation/presentation-wuhan.png` 确认底图及彩色线路正常显示，站点圆圈隐藏。截图不提交版本控制。

## 站点批量删除与真实线网恢复

- 日期：2026-10-08。按用户最新要求恢复 58 城高德快照、城市加载入口、更新脚本及各城市保存副本；数据获取日期仍为 2026-10-07，不表示实时运营核实。
- 新增地图点选、列表勾选、全选及批量删除；删除所有线路中的站点引用，保留控制点，一步撤销恢复全部。
- `npm run lint`、`npm test`（62/62）、`npm run build`：PASS。全部内置城市结构、数量、坐标及来源哈希检查通过。
- `validation/city_network_flow.py`：PASS。实际打开全部 58 城核对线路与站点数量，武汉改名、城市切换保存、刷新恢复、还原原始线路及撤销、加载失败和损坏数据保护、移动端布局通过，页面 JavaScript 异常为 0。
- `validation/browser_flow.py`：PASS。地图点选、列表取消与重新勾选、全选、清空选择、批量删除及一次撤销恢复、新建项目取消与保存/放弃选择、原有编辑回归均通过，页面 JavaScript 异常为 0。
- Phase 2.2 的控制点索引修复和精准孤点清理、新建项目的保存或放弃选择仍保留。下面移除快照的记录仅描述当时版本，已由此次恢复替代。

## 新建项目交互修复

- 日期：2026-10-08。连续的浏览器确认与命名弹窗改为页面内单一对话框，提供项目名称、取消、保存并新建、不保存直接新建；空名称提示后保留当前项目。
- `npm run lint`、`npm test`（53/53）、`npm run build`：PASS。本机 Chrome 浏览器回归：PASS，覆盖取消保留数据、不保存创建空项目、保存下载原项目、空名称校验和原有编辑流程，页面 JavaScript 异常为 0。

## Phase 2.2 风险收口与修复

- 日期：2026-10-07；基线：`8a64bc50c4b706c3a15052ff70cb5caf73a69c4d`。
- 最新版本移除 59 个已跟踪的第三方 transit JSON（58 城快照及目录）和批量更新脚本；城市搜索只定位地图，页面明确提示真实线网暂未内置。Git 历史未改写。
- 待插入控制点的索引在节点增删或重排时清空并回到浏览模式；改名、改色和拖动坐标保留该索引。
- 删除线路或线路节点时，仅检查本次移除引用的 Waypoint；原本孤立或仍被其他线路引用的 Waypoint 保留。Undo / Redo 恢复项目数据，不恢复待插入 UI 状态。
- `npm ci`、`npm run lint`、`npm test`（53/53）、`npm run build`、`npm audit --audit-level=moderate` 均 PASS；审计结果为 0 个已知漏洞。Node 20.12.1 冷安装仍提示部分间接依赖声明较新的 Node 版本，实际检查均通过。
- 本机 Chrome 对生产预览执行 `validation/browser_flow.py`：PASS。覆盖城市搜索与常用城市定位、站点与控制点编辑、Undo/Redo、JSON 导入导出、旧版迁移、localStorage、移动端布局；确认线网入口消失、降级说明可见、页面 JavaScript 异常为 0。导入 JSON 后改用等待预期 DOM 数量，避免异步导入尚未完成时的偶发误报。
- 已知限制：OpenFreeMap 底图与 Nominatim 搜索依赖网络；MapLibre 构建包仍触发 500 kB 提示；此前快照保留在未改写的 Git 历史中；旧版 `metro-planner.city.*` 本地副本未清除，但当前版本没有城市切换入口，应通过已打开的项目导出备份。

## 历史记录：真实城市线网验证（快照现已恢复）

- 日期：2026-10-07；来源：高德地铁图当日接口快照，见 `docs/TRANSIT_DATA.md`。
- 已移除的历史版本曾内置 58 个城市线网、397 条线路或支段；武汉当时为 13 条线路、289 个站。该历史快照通过了项目结构、数量、坐标范围、来源哈希和线路绘制检查。
- `npm ci`：PASS；`npm run lint`：PASS；`npm test`：54/54 PASS；`npm run build`：PASS。构建仍提示 MapLibre 主包超过 500 kB。
- 本机 Chrome 浏览器流程：新浏览器默认载入武汉；改名、撤销/重做、切换城市后恢复修改、刷新恢复、重置与恢复内置数据、自主规划隔离、快速切换取消旧请求、加载失败和损坏保存保护；逐一打开 58 城并核对线路和站点数；移动端布局和页面异常检查均通过。
- 原有绘图浏览器回归通过。`npm audit --audit-level=moderate`：0 个已知漏洞；开发工具链已更新 `typescript-eslint` 与相关锁定依赖。当前本机 Node 20.12.1 安装时仍会提示部分间接依赖声明较新的 Node 版本，但 lint、测试与构建均通过。
- 本地页面 `http://127.0.0.1:5173/` 返回 200。各站之间按直线绘制；内置数据为第三方快照，不表示实时运营状态。

## 城市导航与编辑体验验证

- 日期：2026-10-04；基线：`33a89de9310aaa1fa248b66c094b45303fbb062c`。
- 常用城市快捷入口与世界城市名称搜索已接入。城市切换只改变地图视角，不修改项目 JSON；视角单独保存在 `metro-planner.map-view`。
- 本机 Chrome 浏览器流程：先跳转北京、刷新后确认视角恢复；再通过真实 Nominatim 搜索“巴黎”并定位；随后返回武汉。点击站点名称就地改名；`Ctrl+Z` 撤销、`Ctrl+Y` 重做；进入添加控制点模式后连续点击线路两次，得到两站之间的两个有序控制点。Phase 1.1 和 Phase 2 回归仍通过，页面无 JavaScript 异常。
- 单元测试新增线段位置判断、撤销/重做、恢复被删控制点，以及重复保存原值不占用撤销步骤、不清除重做历史，当前总数 47 项。`npm run lint`、`npm test`（47/47）、`npm run build`：PASS。本机 Chrome 流程在最终修复后复验通过，覆盖顶部撤销/重做按钮及未改名输入框的聚焦、失焦；页面 JavaScript 异常为 0。
- 实现提交：`a43968f56c9014c819771e6ffc1a7bd2ef00bf07`；GitHub Actions CI：PASS，[运行 #37204668245](https://github.com/kaijiHou/metro/actions/runs/37204668245) 完成安装、Lint、47 项单元测试和生产构建。

## Phase 2 验证

- 日期：2026-09-30
- 开始基线：`eb818ead29bff1dce7bdb6eaaf21e248b0bc4e82`
- 实现提交：`5e76ee13ee1439a811d03f2bbcbfd08dd1a2bb67`
- Windows / PowerShell 7；Node.js 20.12.1；本机 Chrome；Python 3.10.20 + Playwright 1.63.0

| 验证 | 结果 |
| --- | --- |
| `npm ci` | PASS；从锁文件冷安装，222 个包；0 个已知漏洞。 |
| `npm run lint` | PASS；排除本地 Python `.venv`，项目代码零错误、零警告。 |
| `npm test` | PASS；43 项全部通过，比 Phase 1.1 增加 26 项。 |
| `npm run build` | PASS；TypeScript strict 与 Vite 生产构建通过。 |
| `npm audit --audit-level=moderate` | PASS；0 个已知漏洞。 |
| 本机 Chrome 浏览器流程 | PASS；针对生产 preview，无页面 JavaScript 异常。 |
| GitHub Actions CI | PASS；[运行 #36684355954](https://github.com/kaijiHou/metro/actions/runs/36684355954) 完成 Ubuntu / Node.js 20 安装、Lint、43 项测试与生产构建。 |

新增覆盖：v1 单/多线路与共享站迁移、空线路、v2 passthrough、错误版本；v2 节点和经纬度严格校验；控制点插入、拖动后的坐标更新、删除及孤点清理；上下排序与越界保护；互斥选择；station/waypoint GeoJSON 顺序与换乘隔离；旧 localStorage 键成功迁移、写入失败不删旧键、v1 JSON 导入后转 v2。

浏览器回归继续覆盖 Phase 1.1 的三站、共享换乘、拖动、线路编辑、导入导出、刷新恢复、坏数据提示、移动端布局。Phase 2 额外验证：在站点之间插入控制点；拖动后坐标改变；控制点 Marker 在线路改名改色和拖动后保持同一 DOM；节点上移、下移及删除；v2 导出有 `waypoints` / `nodes` 而无 v1 字段；v1/v2 fixture 导入；旧浏览器键自动升级并删除；坏旧键保持原值。

已知限制：底图依赖 OpenFreeMap 在线服务；MapLibre 主包仍触发 Vite 500 kB 提示；Node 20.12.1 安装时仍提示一个间接依赖声明 Node 22，但全部检查和浏览器流程通过。GitHub Actions 另提示现用 `checkout@v4`、`setup-node@v4` 的运行时将从 Node 20 转到 Node 24；本次 CI 仍通过。Undo/Redo 与其他后续功能未进入 Phase 2。

## Phase 1.1 收口验证

- 日期：2026-09-30
- 基线 commit：`a65bf0f31023f6e8c0b9651ed27df1d7dc590cae`
- Phase 1.1 最终实现 commit：`48b6f350fb5e268a74bb9022de5fc4a47912a760`
- Windows / PowerShell 7
- Node.js 20.12.1、npm 10.5.0
- Python 3.10.20
- Playwright 1.63.0（从 `validation/requirements.txt` 安装到全新 `.venv`）
- 浏览器：本机 Chrome，通过 `METRO_BROWSER_CHANNEL=chrome` 运行

### 命令结果

| 命令 | 结果 |
| --- | --- |
| `npm ci` | PASS；严格使用 `package-lock.json` 完成冷安装。 |
| `npm run lint` | PASS；ESLint 无错误、无警告。 |
| `npm test` | PASS；17 项测试全部通过，其中 Store 核心行为 10 项。 |
| `npm run build` | PASS；TypeScript 严格检查与 Vite 生产构建通过。 |
| `npm audit --audit-level=moderate` | PASS；0 个已知漏洞。 |
| `pip install -r validation/requirements.txt` | PASS；在全新 `.venv` 中安装。 |
| `python validation/browser_flow.py` | PASS；针对生产 preview，无页面 JavaScript 异常。 |
| GitHub Actions CI | PASS；[运行 #36676002899](https://github.com/kaijiHou/metro/actions/runs/36676002899) 在 Ubuntu / Node.js 20 完成 lint、17 项测试和生产构建。 |

### Phase 1.1 新增验证

- Store：覆盖 `createLine`、`createStation`、无线路创建保护、`addStationToLine` 去重、`deleteLine`、`deleteStation`、`updateStation` 非法坐标保护、`loadProject`、`resetProject`、`removeStationFromLine`。
- Marker：创建 3 个站点后保存第一个 Marker DOM identity；修改线路颜色和名称后验证仍是同一已连接 DOM 节点。实现已从全量 remove/recreate 改为按 stationId 增量新增、更新和删除。
- Migration：version 1 原样通过；version 99、缺失 version、字符串 version 和非整数 version 明确拒绝。
- localStorage：坏 JSON 返回空项目和 warning；读取失败时不覆盖原数据；用户随后修改项目时正常写入新数据。
- 测试发现：`tests/index.test.ts` 聚合全部 `src/**/*.test.ts` 模块，Windows 与 Ubuntu 使用相同命令。

### 浏览器回归场景

| 场景 | 结果 |
| --- | --- |
| 未选择线路时添加站点保护 | PASS |
| 新建线路并连续创建 3 个站 | PASS |
| 三站按顺序自动连线 | PASS |
| 修改线路名称、颜色和站点名称 | PASS |
| 线路编辑后 Marker DOM identity 保持 | PASS |
| 拖动站点且线路同步 | PASS |
| 创建第二条线路并加入已有站点 | PASS |
| 动态换乘样式 | PASS |
| 共享站点拖动后两线共用更新坐标 | PASS |
| 删除第二条线路且保留站点和第一条线 | PASS |
| JSON 导出、新建项目、重新导入 | PASS |
| 刷新后 localStorage 恢复 | PASS |
| 错误版本 JSON 不覆盖当前项目 | PASS |
| 损坏 localStorage 回退并提示 | PASS |
| 删除 Station 清理所有线路引用 | PASS |
| 缩放、resize、390 px 移动端布局 | PASS |

## GitHub Actions

CI 位于 `.github/workflows/ci.yml`，在 push 和 pull request 时使用 Ubuntu 与 Node.js 20 执行 `npm ci`、lint、全部单元测试和生产构建。浏览器流程依赖 OpenFreeMap 公网服务，保留为本地自动化验证，避免 CI 因外部地图服务波动假失败。

## Known Issues

- OpenFreeMap 是在线底图；网络较慢时初次加载矢量瓦片可能需要数秒。断网时底图不可用，本地项目数据仍可保存。
- OpenFreeMap Liberty 样式偶尔输出道路盾牌过滤条件警告，未影响本次地图显示或编辑。
- Vite 提示 MapLibre 主包超过默认 500 kB 阈值；MapLibre 是第一阶段核心依赖，本次不为提示进行业务无关拆分。
- Node.js 20.12.1 安装依赖时会提示 MapLibre 间接依赖声明 Node 22，但 lint、测试、构建和浏览器回归均在 Node 20.12.1 通过；GitHub CI 使用 Node 20 最新维护版本。
- 本阶段仍只有 schema v1 和直线站点序列；Waypoint、nodes、重排序与 Undo/Redo 未实现。

## Phase 4B 交付验收（2026-10-15）

本节为本次实际结果；前文为历史阶段记录。基线为 `875273a3745e7c9042070becbac2b59f746d52a2`。本节随 Phase 4B 功能提交；最终提交 SHA、main 同步和对应 CI 运行链接以交付消息为准。

### 1. 行政区与轮廓地图

- PASS：OCHA/HDX COD-AB China 原始 SHP 的 ADM2_PCODE 与同源 XLSX 字典按精确代码关联，逐项核对名称、上级、行政层级；WGS84 几何合法性验证和莱芜并入济南处理。许可 CC BY 3.0 IGO，来源、下载地址、处理步骤见 `docs/FOOTPRINT_DATA_SOURCES.md`。
- 当前支持 339 个市级区域、33 个省级分组；另含 34 个省级轮廓。代码为版本化 HDX PCODE，不冒充 GB/T 行政代码。统计分母采用已支持区域；湖北为 13。源数据名含 2020，HDX 标记 reviewed 2024，并非当前全国行政区划完整核验。
- 21 条原始记录因县级、省级或错误层级排除，其中台湾整体仅作为不可点亮的省级轮廓；不能把 21 当作全国仅缺 21 个城市。详细排除记录和覆盖边界见 mapping-audit.json、sources.json。
- PASS：全国轮廓默认视图、深蓝仪表盘、真实省界/省名、点亮市区、搜索、筛省；城市选择打开详情且保持全国视野，放大后显示市界，无街道/卫星底图。390px 布局仍保持可识别的中国轮廓。

### 2. 真实浏览器结果及截图

`validation/phase4b_footprint_flow.py` 在隔离 Chromium profile 运行，32 项 PASS，0 个运行时异常；结构化结果见 `validation/phase4b-browser-results.json`。

真实武汉多边形点击、点亮状态和其他城市 feature-state 已检查：武汉点亮后黄冈/襄阳不变；可点亮非地铁城市；省份筛选、样式重建、取消点亮保留日期/备注/照片均 PASS。

本地真实截图（忽略提交，未读取用户相册）：`validation/phase4b-outline-default-preview.png`、`phase4b-wuhan-preview.png`、`phase4b-mobile-viewport.png`。个人上传测试使用合成图片；行政边界和默认黄鹤楼照片为真实来源，未用模拟市界证明覆盖。

### 3. 城市相册与许可

- PASS：PNG/JPEG/WebP 实际解码，多图上传、原图与缩略图 Blob 保存、全部/默认/我的过滤、查看大图和键盘切换、封面、排序、备注、删除及封面回退、刷新恢复、ObjectURL 释放。HEIC 拒绝且提供提示。
- 默认图当前仅武汉黄鹤楼。GoodFreePhotos 原始页面声明 Public Domain/CC0，条款明确允许个人及商用；实际图片、SHA256、原始页面及条款链接记录在 sources.json，界面显示署名。其余城市为真实占位，可自行上传照片；没有假称全国都有版权默认图。
- 用户照片仅保存在当前 origin 的本地浏览器中。测试未发出照片外传 POST。清除站点数据可能丢失，ZIP 备份为用户自持备份。

### 4. 数据库与异常

Dexie `MetroFootprintDB` v1：visits 索引 `cityCode,status`；photos 索引 `photoId,cityCode,[cityCode+sortOrder]`；settings 主键 `key`（预留设置，目前无业务记录）。与 MetroProject/localStorage 的存储和事务隔离。未来升级应增加 Dexie version 并显式迁移，不能删除用户库。

PASS：重新打开数据库、持久化原图字节、取消点亮保留相册、关联封面修复、日期校验、单图/总量限制、配额失败、禁用 IndexedDB 的明确错误提示、事务中途失败完全回滚。限制为每张 20MB、全库 300 张/160MB；容量估算不是浏览器配额保证。

### 5. ZIP 备份/恢复

PASS：manifest schema1 + 实际原图二进制 + SHA256 的完整 ZIP；在新的隔离浏览器中导入后逐张核对原始字节哈希、日期、备注、封面。合并和覆盖模式均验证，覆盖恢复已删照片；全部验证通过后才开始原子事务。

PASS：路径穿越、重复 ID/路径、未知城市、错误 schema、图片损坏、关联错误、超限、实际解压量超过声明、有效大备注自导出再导入、清库后事务后段失败回滚。ZIP/总解压上限 180MB，manifest 16MB，使用受限流式解压。导入取消或失败不更改原记录。

### 6. 地铁回归与隔离证据

- 原 Phase 4 浏览器流程 23 项 PASS；异常/移动端流程 5 项 PASS。外部底图顶层样式失败时保留本地可编辑线网并支持重试；错误场景使用明确的 503/404/受控 Overpass fixture，不用于证明公网数据覆盖。
- 足迹切换前后比较完整项目、Scenario、Undo/Redo 和已持久化字符串，且实际执行撤销/重做，结果不变。全国浏览武汉→长沙自动加载和出口详情回归 PASS。
- `validation/phase4b-snapshot-regression.json`：58 个原始地铁城市快照 JSON 内容与基线完全相同。以下为前后相同的线/站数量。

| 城市 | 基线线路/站点 | 本次线路/站点 |
| --- | --- | --- |
| 武汉 | 13 / 289 | 13 / 289 |
| 长沙 | 7 / 151 | 7 / 151 |
| 北京 | 27 / 410 | 27 / 410 |
| 上海 | 24 / 418 | 24 / 418 |
| 广州 | 23 / 332 | 23 / 332 |

### 7. 命令和生产环境

| 实际执行项 | 结果 |
| --- | --- |
| Node 24 下 npm ci | PASS，221 个依赖安装 |
| npm run lint | PASS，0 errors / 0 warnings |
| npm test | PASS，105 tests / 0 fail |
| npm run build（根路径） | PASS |
| /metro/ 子路径构建 | PASS |
| npm audit --audit-level=moderate | PASS，0 vulnerabilities |
| npm run preview | PASS，实际预览服务启动并完成下面两组测试 |
| 足迹 /metro/ 生产 smoke | PASS，本地目录/省界/默认图正确请求，真实上传/ZIP 下载，原项目保留 |
| 地铁 /metro/ 生产 smoke | PASS，目录/武汉/鄂州/长沙/湘潭资源正确请求，原项目保留 |

机器报告：`validation/phase4b-browser-results.json`、`phase4b-production-results.json`、`phase4b-snapshot-regression.json`、`phase4b-audit.json`；命令原始日志保存在本地 validation 的 phase4b-*.log，未提交大量截图或下载原件。

### 8. 依赖与 CI

新增固定版本 Dexie 4.4.6（Apache-2.0）、JSZip 3.10.2（双许可中选择 MIT）、开发依赖 fake-indexeddb 6.2.5。CI 使用 Node 24，执行安装、lint、单测、构建。最终 push 对应 HEAD 的 CI 应实际运行完成，并在交付消息给出结果和链接。

### 9. 已知限制与 NOT RUN

- 339 个区域为历史来源的可支持子集，未独立逐一核验当前法定边界；不承诺全国所有城市、县级直辖单位和最新区划齐全。台湾未作为整省“城市”入库。
- 默认版权照片目前只有武汉，其余城市为空占位；不包含全国照片包。
- 浏览器本地存储与站点 origin 绑定，无云同步。外部文字 glyph 和原地铁底图依赖网络，断网可影响地名/底图；足迹轮廓几何使用本地静态数据。
- 既有 ESLint 9.36 弃用提示和 MapLibre 主包超过 500kB 的构建提示仍存在；安装、lint、构建均成功。
- NOT RUN：Firefox/Safari、实体手机硬件、全部 339 区域逐城人工现势核对、单独 EXIF 旋转 JPEG 样本。实现使用原生 from-image 方向处理，实测 JPEG 为常规编码样本。
- GPS 定位/步行导航未实现，遵循本阶段明确边界。
