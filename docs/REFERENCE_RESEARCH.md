# 参考研究（编码前）

研究日期：2026-09-29。独立实现；没有复制 MetroDreamin 源码。

## 阅读的资料与文件

- MetroDreamin：`components/Map.js`、`components/Station.js`、`components/Line.js`、`components/System.js`、`util/helpers.js`、`util/mapProvider.js`，以及仓库目录和 `LICENSE.txt`。其线路使用有序的 `stationIds`，站点可被多线引用；地图与编辑器分别处理显示和业务交互。Waypoint 在该项目中与站点相关，但本项目会采用独立的未来节点类型。
- MapLibre GL JS：官方文档与 GitHub。采用一次初始化地图、GeoJSON Source + Line Layer、拖动 Marker；数据变化时调用 `GeoJSONSource#setData`。组件卸载清理监听、Marker 和 Map。
- OpenStreetMap：官网和官方瓦片使用政策。OSM 数据与官方瓦片服务不同；不把 `tile.openstreetmap.org` 当作无限制底图。
- OpenFreeMap：官网明确说明其公开实例可免费用于网站和应用，无注册且不限制地图请求；选用其 `https://tiles.openfreemap.org/styles/liberty` 样式，保留底图署名和集中配置。
- Zustand 官方文档：`create`、selector 与不可变更新。
- GeoJSON 官网：FeatureCollection、Point、LineString；坐标始终为 `[lng, lat]`。

## 实现决策

1. **MetroDreamin 借鉴**：Station 独立于 Line；Line 保留有序的站点 ID；共享同一站点 ID 即换乘；地图编辑操作转换为数据更新。
2. **明确不采用**：Next.js、SSR、Firebase、账户、社区、分享、列车与客流模拟、复杂转乘算法、Turf 和 Mapbox token 体系。
3. **MapLibre**：开放地图渲染器，可直接加载公开 MapLibre 样式，无须沿用 MetroDreamin 的 Mapbox 商业配置。
4. **Station**：`id/name/lng/lat`，稳定 UUID；名字可改，坐标可拖动更新。
5. **MetroLine**：`id/name/color/stationIds`；站点顺序由数组顺序定义，删除线路不删除站点。
6. **Waypoint 扩展**：当前只有站点；将几何生成集中在 `src/utils/geojson.ts`。第二阶段可把线路序列迁移到带类型的 `nodes`，并在该模块解析 waypoint 坐标。
7. **地图生命周期**：React effect 只初始化 Map 一次，监听成对注册/移除；地图事件通过 `useMetroStore.getState()` 读取最新操作状态，避免因 React 渲染反复绑定或读取过期快照。ResizeObserver 调用 `map.resize()`，卸载释放 Map 和 Marker。
8. **GeoJSON 刷新**：Zustand 项目变化时重新生成 FeatureCollection，已加载的 source 用 `setData` 更新。少于两个有效站点时不生成 LineString。异常引用跳过并记开发日志。
9. **保存**：版本 1 JSON 自动写入 localStorage；导入与本地恢复均先经过 migration pipeline，再完整校验并原子替换项目。当前迁移入口只接受 schema v1，未知版本明确拒绝；旧数据异常时回退空项目并给出提示。

## 许可证

MetroDreamin 为 GNU AGPL；本项目仅借鉴设计思想，没有复制其非平凡源码。MapLibre GL JS 为 BSD-3-Clause。底图遵守 OpenFreeMap / OpenStreetMap 署名要求。
