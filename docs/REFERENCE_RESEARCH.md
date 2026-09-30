# 参考研究（编码前）

研究日期：2026-09-29。独立实现；没有复制 MetroDreamin 源码。

## 阅读的资料与文件

- MetroDreamin：`components/Map.js`、`components/Station.js`、`components/Line.js`、`components/System.js`、`util/helpers.js`、`util/mapProvider.js`，以及仓库目录和 `LICENSE.txt`。其线路在所研究版本使用有序的 `stationIds`，站点可被多线引用；地图与编辑器分别处理显示和业务交互。本项目 Phase 2 采用独立的 Waypoint 节点。
- MapLibre GL JS：官方文档与 GitHub。采用一次初始化地图、GeoJSON Source + Line Layer、拖动 Marker；数据变化时调用 `GeoJSONSource#setData`。组件卸载清理监听、Marker 和 Map。
- OpenStreetMap：官网和官方瓦片使用政策。OSM 数据与官方瓦片服务不同；不把 `tile.openstreetmap.org` 当作无限制底图。
- OpenFreeMap：官网明确说明其公开实例可免费用于网站和应用，无注册且不限制地图请求；选用其 `https://tiles.openfreemap.org/styles/liberty` 样式，保留底图署名和集中配置。
- Zustand 官方文档：`create`、selector 与不可变更新。
- GeoJSON 官网：FeatureCollection、Point、LineString；坐标始终为 `[lng, lat]`。

## 实现决策

1. **MetroDreamin 借鉴**：Station 独立于 Line；Line 保留有序节点引用；共享同一 Station ID 即换乘；地图编辑操作转换为数据更新。
2. **明确不采用**：Next.js、SSR、Firebase、账户、社区、分享、列车与客流模拟、复杂转乘算法、Turf 和 Mapbox token 体系。
3. **MapLibre**：开放地图渲染器，可直接加载公开 MapLibre 样式，无须沿用 MetroDreamin 的 Mapbox 商业配置。
4. **Station**：`id/name/lng/lat`，稳定 UUID；名字可改，坐标可拖动更新。
5. **MetroLine Phase 2**：`id/name/color/nodes`；节点顺序由数组顺序定义，删除线路不删除站点。旧 `stationIds` 只用于 v1 迁移。
6. **Waypoint 扩展**：独立的 `id/lng/lat` 形状控制点，无站名，不参与换乘。`src/utils/geojson.ts` 集中解析 station 与 waypoint 节点坐标。
7. **地图生命周期**：React effect 只初始化 Map 一次，监听成对注册/移除；地图事件通过 `useMetroStore.getState()` 读取最新操作状态，避免因 React 渲染反复绑定或读取过期快照。ResizeObserver 调用 `map.resize()`，卸载释放 Map 和 Marker。
8. **GeoJSON 刷新**：Zustand 项目变化时重新生成 FeatureCollection，已加载的 source 用 `setData` 更新。少于两个有效节点时不生成 LineString。异常引用跳过并记开发日志。
9. **保存**：版本 2 JSON 自动写入稳定 localStorage 键；导入与本地恢复均先经过 migration pipeline，再完整校验并原子替换项目。旧 v1 浏览器数据先写新键，成功后才删除旧键；异常时保留旧数据并提示。

## Phase 2 补充决策

沿用 Phase 1 对 MapLibre Source、Marker 生命周期与 Zustand 单一项目状态的研究。Phase 2 选择简单的 union `LineNode`，由左侧节点列表指定插入位置，避免为地图线段另建命中检测算法。控制点使用比站点更小的菱形 Marker；两个 Marker Map 独立增量同步，拖动回调读取最新 Store。v1 迁移只在输入边界执行，v2 业务代码不保留双数据结构。

## 许可证

MetroDreamin 为 GNU AGPL；本项目仅借鉴设计思想，没有复制其非平凡源码。MapLibre GL JS 为 BSD-3-Clause。底图遵守 OpenFreeMap / OpenStreetMap 署名要求。
