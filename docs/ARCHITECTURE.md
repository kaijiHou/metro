# 架构说明

## 数据与编辑状态

`App` 组合顶部项目操作、左侧模式、线路、站点与控制点面板和右侧 `MapCanvas`。Zustand 的 `metroStore` 保存唯一 `MetroProject` 与临时编辑状态。`createMetroStore()` 可创建隔离测试实例；生产 Store 订阅项目变化后自动保存。

schema v2 把 `stations`、`waypoints`、`lines` 分别按 ID 存放。`MetroLine.nodes` 是 `{ type: 'station' | 'waypoint', id }[]` 有序引用。Waypoint 没有名称，只控制几何；同一 Station 在多条线路中出现才是换乘。面板保持互斥的 `selectedStationId` / `selectedWaypointId`。`pendingInsertIndex` 只用于下一次地图点击，不持久化。

`removeNodeFromLine()` 只移除指定线路中的节点。Station 本体保留；Waypoint 若已无任何线路引用便清理。`deleteStation()` 和 `deleteWaypoint()` 则删除本体并清除所有线路引用。`moveLineNode()` 只改变数组顺序，非法索引不更新项目。

## 地图与控制点交互

`MapCanvas` 只初始化一次 MapLibre Map，注册 `style.load` 和 `click`；卸载时移除监听、ResizeObserver、所有 Marker 与 Map。地图 click、Marker click 与 dragend 回调读取 `useMetroStore.getState()` 中的最新状态。Marker 点击阻止事件传播，避免在添加模式下误加节点。

点击“插入控制点” → Store 设置 `pendingInsertIndex` 与 `add-waypoint` mode → 点击地图 → `createWaypoint(lng, lat, selectedLineId, pendingInsertIndex)` → 插入 `line.nodes` → `lineFeatureCollection()` 调用 `resolveLineNodeCoordinate()` → GeoJSON Source 的 `setData()` 刷新线路 → Waypoint Marker 增量创建。创建后恢复 browse mode 并清空待插入索引；取消模式也清空它。直接选择“添加控制点”会在当前线路末尾追加。

站点与控制点分别由 `Map<string, MarkerRecord>` 增量维护。新 ID 创建 Marker，已有 ID 只更新坐标、标签和选中样式，删除 ID 才移除 Marker。线路改名、改色不会重建 Marker。拖动控制点更新 `waypoints[id]` 的经纬度，所有引用该 ID 的线路随 GeoJSON 重新生成。

## GeoJSON 与持久化

`src/utils/geojson.ts` 是线路节点坐标解析的唯一位置：station 从 `project.stations` 取坐标，waypoint 从 `project.waypoints` 取坐标，按 `nodes` 顺序形成 `[lng, lat]`。异常悬空引用在开发模式下警告并跳过；少于两个有效节点不生成 LineString。正常 JSON 导入会先由 validation 拦截悬空引用。

导入与本地恢复依次执行 `JSON.parse` → `migrateProjectToCurrent()` → `validateProject()`。v1 线路的有序 `stationIds` 由纯函数转成 v2 station nodes，导入后内存与导出格式都为 v2。浏览器启动优先读取稳定键 `metro-planner.project`；没有时读取旧 v1 键，迁移并校验后先写新键，写入成功才删除旧键。失败时保留旧数据并在页面提示错误。
