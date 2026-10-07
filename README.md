# Metro Planner · 地铁线路规划器

一个在真实地图上规划地铁线路的轻量编辑器。用站点和控制点组成有序线路，拖动节点调整形状，并将项目保存在浏览器或导出为 JSON。

## 功能

- 多条线路：创建、命名、改色、选中和删除。
- 内置 58 个中国城市轨道交通线网（含港澳台），选择城市即可打开已有线路和站点并直接修改；各城市的修改分别保存。
- 城市导航：直接选择常用城市，或搜索 OpenStreetMap 收录的世界各地城市；刷新后恢复上次地图位置。内置城市线网无需另行联网查询。
- 地图添加、选择、命名、拖动及删除站点；线路按节点顺序连接。
- 点击线路插入控制点，拖动调整走向；可连续插入多个点，节点也可上移、下移或从当前线路移除。
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

如需更新内置城市数据，使用本机 Python 3.10+ 在项目根目录执行 `python scripts/update-transit.py`，完成后检查 `public/transit/catalog.json` 和 `docs/TRANSIT_DATA.md` 所述来源、范围与限制，再提交生成文件。该脚本仅更新内置原始快照，不修改浏览器中各城市的编辑结果。

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

1. 左侧“城市与真实线路”选择武汉等内置城市后，会载入真实站名、站序和线路；直接选站改名、拖动或删除。换城市后各自保存修改；“自主规划”保留原来自己画的项目。首次使用且浏览器没有旧项目时默认打开武汉。世界其他城市仍可搜索定位地图。
2. 点击“新建线路”，可修改名称和颜色。
3. 点击“添加站点”，在地图上连续点击；站点按加入顺序连接。
4. 点击“添加控制点”，再直接点击线路上的一段，控制点会插入正确位置。可以接着点击线路加入第二个；拖动地图上的小菱形改变走向，完成后点“浏览 / 选择”。若想先指定两节点之间的位置，也可使用列表中的“插入控制点”，再点击地图放置。
5. 在“节点顺序”中点击站点名称，下面会出现改名输入框。点 ↑、↓ 调整顺序，用 × 从当前线路移除。移除站点节点会保留站点；控制点失去最后一条线路引用时会自动删除。操作失误可点顶部“撤销”，或按 `Ctrl+Z`；`Ctrl+C` 是复制。
6. 新建另一条线路后，从“加入已有站点”选择原有站点，形成换乘站。控制点不算站，也不参与换乘。
7. 项目更改自动保存。使用顶部“导出 JSON”备份，或“导入 JSON”恢复。旧版 v1 文件会升级为 v2。侧栏“重置项目”会清空当前城市的规划；“恢复内置原始线路”会把该城市恢复到数据快照，仍可立即撤销；顶部“新建项目”可指定自主规划名称。

## 目录

- `src/components/`：地图与编辑面板。
- `src/store/`：Zustand 单一项目状态与编辑操作。
- `src/models/`：数据类型。
- `src/utils/`：GeoJSON、校验、持久化。
- `src/config/`：底图配置。
- `docs/`：研究、架构、数据格式与测试记录。

## 当前限制与后续计划

内置线路按真实站点之间的直线段绘制，不代表隧道或轨道的测绘路径；数据是标注获取日期的第三方快照，开放状态以运营方公告为准。撤销历史最多保留最近 50 次项目修改，刷新或切换城市后会清空；GeoJSON/KML 文件导出和截图尚未实现。项目保存在当前浏览器，不跨设备同步；清理浏览器数据会清除本地副本，请导出 JSON 备份。旧版浏览器数据会从 `metro-planner.project.v1` 自动迁移到稳定键 `metro-planner.project`；迁移失败会提示并保留旧数据。世界城市搜索需要联网，结果范围取决于 OpenStreetMap 的收录情况；内置城市线网来自项目静态快照。

详细设计见 [架构说明](docs/ARCHITECTURE.md)，数据文件见 [数据格式](docs/DATA_FORMAT.md)，真实线路来源见 [内置线网说明](docs/TRANSIT_DATA.md)。

## License

项目代码采用 [MIT License](LICENSE)。MetroDreamin 仅作为产品交互与数据建模研究参考，本项目没有复制其非平凡源码。
