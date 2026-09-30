# 架构说明

## 组件与状态

`App` 安排顶部项目操作、左侧 `ProjectName` / `ModePanel` / `LinePanel` / `StationPanel` 和右侧 `MapCanvas`。组件通过 Zustand selector 读取状态，通过 store action 修改状态。核心数据只有 `metroStore` 一份。`createMetroStore` 可以为测试创建隔离实例，生产环境的 `useMetroStore` 使用同一套 action 并订阅项目变化进行持久化。

`MetroProject` 包含 `stations` 与 `lines` 两个按 ID 索引的对象。`Station` 存放独立站点，`MetroLine.stationIds` 是有序引用列表。一个 ID 在多条线路中出现即为换乘；删除线路不删站点，删除站点会从所有线路中移除该 ID。

`MapCanvas` 创建唯一 MapLibre Map 实例。初始化 effect 注册 `style.load` 与 `click`，卸载时移除监听、Marker、ResizeObserver 和 Map。地图 click 回调从 `useMetroStore.getState()` 读取当前模式，避免每次状态变化重新注册。站点用可拖动 Marker；线路用 GeoJSON Source + 两层 Line Layer（白色描边与线路颜色）。React 状态变化时调用 Source#setData，MapLibre 负责坐标投影。

Marker 使用 `Map<string, MarkerRecord>` 按 stationId 增量同步。新增站点时创建一个 Marker；已有站点只更新坐标、名称、无障碍标签、选中与换乘 class；删除站点只移除对应 Marker。线路名称、颜色或无关线路变化不会重建已有 Marker。Marker 的 click 与 dragend 回调按 stationId 从 Store 获取最新数据，避免闭包持有过期 Station 快照。

## 点击地图的数据链

点击地图 → MapLibre click event → 读取模式和当前线路 → `createStation(lng, lat)` → 生成 UUID、Station 和线路末尾引用 → Zustand project 更新 → localStorage 自动保存 → `lineFeatureCollection` 生成 GeoJSON → `setData` 更新地图线路，同时 Marker 更新。

拖动 Marker → `dragend` 读取 `getLngLat()` → `updateStation()` → 所有引用该站点的线路共享新坐标 → GeoJSON 更新。删除站点时 store 同时清除所有引用，避免悬空 ID。

## GeoJSON 与保存

`src/utils/geojson.ts` 是线路坐标转换的唯一位置。它跳过缺失或无效坐标，少于两个有效站点不输出 LineString，坐标次序固定为 `[lng, lat]`。未来 Waypoint 可以在此扩展节点解析。

项目 JSON 使用 version 1。store 项目变化时自动写 localStorage；导入和本地恢复依次执行 `JSON.parse` → `migrateProjectToCurrent` → `validateProject`。当前 migration pipeline 只接受 schema v1，后续版本迁移集中扩展 `src/utils/migrations.ts`。校验通过后才一次性替换状态；失败只显示错误，不改动当前项目。导出使用浏览器 Blob 下载。
