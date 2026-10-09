# Metro Planner · 地铁线路规划器

一个在真实地图上规划地铁线路的轻量编辑器。用站点和控制点组成有序线路，拖动节点调整形状，并将项目保存在浏览器或导出为 JSON。

## 功能

- 地图右上角“展示模式”隐藏站点圆圈、站名和控制点，显示沿线名称与颜色图例；“返回编辑”恢复标记。
- Phase 3 规划沙盘：现状线路默认锁定；可解锁副本、显隐线路、区分已建成/在建/规划、查看线路与城市统计。
- 可将现状线路复制为规划线、从首端或末端延长、从已有站点新建支线；每个城市可保存最多 5 个独立方案。
- 多条线路：创建、命名、改色、选中和删除。
- 城市导航：直接选择常用城市，或搜索 OpenStreetMap 收录的世界各地城市；刷新后恢复上次地图位置。内置城市会载入现状线网，各城市分别保存方案。
- 地图添加、选择、命名、拖动及删除站点；线路按节点顺序连接。
- 站点面板“多选删除”支持地图点选、列表勾选与全选；批量删除可一次撤销。
- 点击线路插入控制点，拖动调整走向；可连续插入多个点，节点也可上移、下移或从当前线路移除。
- 节点列表旁可继续新增站点或从最前面头插；已有站点支持按站名、线路编号搜索，显示所属线路，并可加入首端或末端。
- 顶部“撤销 / 重做”支持纠正编辑，键盘快捷键为 `Ctrl+Z` / `Ctrl+Y`（Mac 为 `⌘Z` / `⌘⇧Z`）。
- 已有站点可加入其他线路；同一站点被多条线路引用时显示为换乘站。
- 浏览、添加站点与添加控制点模式分离；地图支持平移、滚轮缩放与缩放按钮。
- 自动保存到 localStorage；导出版本 2 JSON，旧版本 1 JSON 可导入并自动升级。

## 技术栈

Vite、React 18、TypeScript（严格检查）、MapLibre GL JS、Zustand、GeoJSON、localStorage。底图使用 [OpenFreeMap](https://openfreemap.org/) 的公开 Liberty 样式，地图数据来自 OpenStreetMap。底图需要联网。

## 安装与运行

需要 Node.js 20 和 npm。

Windows 本机已安装依赖后，双击 `scripts/start-metro.cmd` 即可启动并自动打开浏览器。地址固定为 `http://127.0.0.1:5173/`；使用期间保留启动窗口，关闭窗口即可停止服务。已在运行时会直接打开页面。

手动安装与启动：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。构建、检查与测试：

```sh
npm run lint
npm run build
npm test
```

GitHub Actions 会在每次 push 和 pull request 时使用 Node.js 20 执行 `npm ci`、lint、全部单元测试和生产构建。

内置 58 个城市线网、397 条线路或支段的高德地铁图快照（获取于 2026-10-07），支持修改站点和线路。数据来源与更新方式见 [真实线网说明](docs/TRANSIT_DATA.md)。

## 浏览器回归验证

浏览器流程使用 Python Playwright，依赖锁定在 `validation/requirements.txt`。在 Windows PowerShell 中准备一次环境：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r validation\requirements.txt
python -m playwright install chromium
```

如果机器已经安装 Chrome，可跳过最后一条浏览器下载命令，并在运行脚本前设置 `$env:METRO_BROWSER_CHANNEL = 'chrome'`。不设置该变量时，脚本使用 Playwright 安装的 Chromium。

先在一个终端启动生产预览：

```powershell
npm ci
npm run build
npm run preview
```

再在已激活虚拟环境的另一个终端运行：

```powershell
$env:METRO_URL = 'http://127.0.0.1:4173/'
$env:METRO_BROWSER_CHANNEL = 'chrome' # 仅在复用本机 Chrome 时设置
python validation\browser_flow.py
python validation\city_network_flow.py
```

该流程需要访问 OpenFreeMap，因此作为本地回归验证运行，不放入 GitHub CI。脚本覆盖站点与控制点编辑、旧数据迁移，并确认线路改名、改色后原 Marker DOM 节点保持不变。

## 使用

1. 左侧“城市与真实线路”可选择城市线网、快捷按钮或搜索。武汉等内置城市首次载入真实线路，后续恢复你的修改；“自主规划”保留自建项目。现状线路默认锁定，可复制为规划线路或明确解锁副本。“恢复内置原始线路”可还原当前城市，支持撤销。
2. “规划方案”可从现状新建方案、复制当前方案、重命名、切换或删除；方案按城市分开自动保存。切换方案会清空撤销历史，保留地图视角。
3. 点击“新建线路”，可修改名称、颜色、状态与显示方式；线路面板提供复制、首尾延长和全显/全隐。规划统计显示线路长度和站距。
4. 点击“添加站点”，在地图上连续点击；站点按加入顺序连接。
5. 点击“添加控制点”，再直接点击线路上的一段，控制点会插入正确位置。可以接着点击线路加入第二个；拖动地图上的小菱形改变走向，完成后点“浏览 / 选择”。若想先指定两节点之间的位置，也可使用列表中的“插入控制点”，再点击地图放置。
6. 在“节点顺序”中点击站点名称，下面会出现改名输入框。点 ↑、↓ 调整顺序，用 × 从当前线路移除。移除站点节点会保留站点；控制点失去最后一条线路引用时会自动删除。操作失误可点顶部“撤销”，或按 `Ctrl+Z`；`Ctrl+C` 是复制。
7. 新建另一条线路后，从“加入已有站点”选择原有站点，形成换乘站。控制点不算站，也不参与换乘。
8. 项目更改自动保存。使用顶部“导出 JSON”备份，或“导入 JSON”恢复。旧版 v1 文件会升级为 v2。城市内“重置项目”会清空规划线路并保留现状线网；顶部“新建项目”可指定新名称，选择“保存并新建”下载当前项目备份，或“不保存，直接新建”开始空项目。

## 目录

- `src/components/`：地图与编辑面板。
- `src/store/`：Zustand 单一项目状态与编辑操作。
- `src/models/`：数据类型。
- `src/utils/`：GeoJSON、校验、持久化。
- `src/config/`：底图配置。
- `docs/`：研究、架构、数据格式与测试记录。

## 当前限制与后续计划

线路按相邻节点之间的直线段绘制，不代表隧道或轨道的测绘路径。撤销历史最多保留最近 50 次项目修改，刷新页面后会清空；GeoJSON/KML 文件导出和截图尚未实现。项目保存在当前浏览器，不跨设备同步；清理浏览器数据会清除本地副本，请导出 JSON 备份。旧版浏览器数据会从 `metro-planner.project.v1` 自动迁移到稳定键 `metro-planner.project`；迁移失败会提示并保留旧数据。世界城市搜索需要联网，结果范围取决于 OpenStreetMap 的收录情况。

详细设计见 [规划模型](docs/PLANNING_MODEL.md)、[架构说明](docs/ARCHITECTURE.md)、[数据格式](docs/DATA_FORMAT.md) 和 [真实线网说明](docs/TRANSIT_DATA.md)。

## License

项目代码采用 [MIT License](LICENSE)。MetroDreamin 仅作为产品交互与数据建模研究参考，本项目没有复制其非平凡源码。
