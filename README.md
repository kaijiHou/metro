# Metro Planner · 地铁线路规划器

一个在真实地图上规划地铁线路的轻量编辑器。创建线路，点击地图添加站点，拖动调整位置，自动连线，并将项目保存在浏览器或导出为 JSON。

## 功能

- 多条线路：创建、命名、改色、选中和删除。
- 地图添加、选择、命名、拖动及删除站点；线路按站点加入顺序自动连接。
- 已有站点可加入其他线路；同一站点被多条线路引用时显示为换乘站。
- 浏览与添加站点模式分离；地图支持平移、滚轮缩放与缩放按钮。
- 自动保存到 localStorage；导入和导出版本 1 JSON，导入时校验数据。

## 技术栈

Vite、React 18、TypeScript（严格检查）、MapLibre GL JS、Zustand、GeoJSON、localStorage。底图使用 [OpenFreeMap](https://openfreemap.org/) 的公开 Liberty 样式，地图数据来自 OpenStreetMap。底图需要联网。

## 安装与运行

需要 Node.js 20 和 npm。

```sh
npm install
npm run dev
```

打开终端显示的本地地址。构建与测试：

```sh
npm run build
npm test
```

## 使用

1. 点击“新建线路”，可修改名称和颜色。
2. 点击“添加站点”，在地图上连续点击；站点按加入顺序连接。
3. 拖动站点可改变线路形状；点击站点或从侧栏选择后可改名、删除。
4. 新建另一条线路后，从“加入已有站点”选择原有站点，形成换乘站。
5. 项目更改自动保存。使用顶部“导出 JSON”备份，或“导入 JSON”恢复。侧栏“重置项目”会清空当前项目；顶部“新建项目”可指定新名称。

## 目录

- `src/components/`：地图与编辑面板。
- `src/store/`：Zustand 单一项目状态与编辑操作。
- `src/models/`：数据类型。
- `src/utils/`：GeoJSON、校验、持久化。
- `src/config/`：底图配置。
- `docs/`：研究、架构、数据格式与测试记录。

## 当前限制与后续计划

线路目前是相邻站点之间的直线段；尚无 Waypoint、站点重排序、撤销重做、GeoJSON/KML 导出或截图。这些属于下一阶段，不在当前版本中。项目保存在当前浏览器，不跨设备同步；清理浏览器数据会清除本地副本，请导出 JSON 备份。

详细设计见 [架构说明](docs/ARCHITECTURE.md)，数据文件见 [数据格式](docs/DATA_FORMAT.md)。
