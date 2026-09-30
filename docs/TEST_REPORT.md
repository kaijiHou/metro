# 测试报告

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
