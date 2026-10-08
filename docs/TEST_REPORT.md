# 测试报告

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
