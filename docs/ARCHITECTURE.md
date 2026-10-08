# 架构说明

## 数据与编辑状态

`App` 组合顶部项目操作、左侧模式、线路、站点与控制点面板和右侧 `MapCanvas`。Zustand 的 `metroStore` 保存唯一 `MetroProject` 与临时编辑状态。`createMetroStore()` 可创建隔离测试实例；生产 Store 订阅项目变化后自动保存。

`CitySearch` 结合 `CityNetworkPanel` 载入 `public/transit/` 内置城市线网或恢复城市副本；首次无保存项目时载入武汉，已有项目保持。未知城市使用 OpenStreetMap Nominatim 搜索定位地图。切换前保存当前项目，失败则保留；切换成功清空撤销历史，避免跨城市撤销。MapLibre 的 `moveend` 保存独立视角，地图视角不写入项目 JSON。

schema v2 把 `stations`、`waypoints`、`lines` 分别按 ID 存放。`MetroLine.nodes` 是 `{ type: 'station' | 'waypoint', id }[]` 有序引用。Waypoint 没有名称，只控制几何；同一 Station 在多条线路中出现才是换乘。多选模式使用临时 `selectedStationIds`，批量删除为一次项目更新、一次撤销。面板保持互斥的 `selectedStationId` / `selectedWaypointId`。`pendingInsertIndex` 只用于下一次地图点击，不持久化。

为兼容已有项目，格式仍接受可选 `cityId`；环线使用可选 `closed: true`，绘制时追加首站坐标，插入控制点时也检查闭合线段。各城市修改分别保存到 `metro-planner.city.*`；恢复原始线路采用普通项目更新，可以撤销。

`removeNodeFromLine()` 只移除指定线路中的节点。Station 本体保留；若本次移除的是 Waypoint，且它不再被任何线路引用，才清理该 Waypoint。删除线路时也只检查被删线路刚移除的 Waypoint 引用，不触碰无关的孤立 Waypoint。`deleteStation()` 和 `deleteWaypoint()` 则删除本体并清除所有线路引用。`moveLineNode()` 只改变数组顺序，非法索引不更新项目。改变 `nodes` 结构或顺序的操作会取消待插入位置，改名、改色和拖动坐标不会取消。

Store 在项目对象变化时记录前一个不可变快照，最多保留 50 步；新的编辑会清除重做历史。名称、颜色或坐标未改变时不更新项目，避免输入框失焦消耗撤销步骤或清除重做。`undo()` / `redo()` 恢复快照并触发原有自动保存，编辑模式和待插入位置同时清空。顶部按钮和页面级 `Ctrl+Z` / `Ctrl+Y` 快捷键调用这两个 action；输入框获得焦点时保留浏览器原生文字撤销。历史只在当前页面会话中保留，不进入项目 JSON。

## 地图与控制点交互

`MapCanvas` 只初始化一次 MapLibre Map，注册 `style.load` 和 `click`；卸载时移除监听、ResizeObserver、所有 Marker 与 Map。地图 click、Marker click 与 dragend 回调读取 `useMetroStore.getState()` 中的最新状态。Marker 点击阻止事件传播，避免在添加模式下误加节点。

点击列表中的“插入控制点” → Store 设置 `pendingInsertIndex` 与 `add-waypoint` mode → 点击地图 → `createWaypoint(lng, lat, selectedLineId, pendingInsertIndex)` → 插入 `line.nodes` → `lineFeatureCollection()` 调用 `resolveLineNodeCoordinate()` → GeoJSON Source 的 `setData()` 刷新线路 → Waypoint Marker 增量创建。此精确插入操作完成后恢复 browse mode 并清空待插入索引；取消模式也清空它。

更直接的操作是进入“添加控制点”模式后点击当前线路。地图在已渲染的线路附近寻找当前选中线路，`nearestLineInsertIndex()` 使用投影后的像素距离确定所点线段，节点便插入对应位置。该模式可连续插入多个控制点；点击地图空白处不会在有线路时误追加节点。拖动新建的菱形 Marker 即可形成弯曲。列表中的“插入控制点”仍可指定索引并在地图任意位置放置。

站点与控制点分别由 `Map<string, MarkerRecord>` 增量维护。新 ID 创建 Marker，已有 ID 只更新坐标、标签和选中样式，删除 ID 才移除 Marker。线路改名、改色不会重建 Marker。拖动控制点更新 `waypoints[id]` 的经纬度，所有引用该 ID 的线路随 GeoJSON 重新生成。

## GeoJSON 与持久化

`src/utils/geojson.ts` 是线路节点坐标解析的唯一位置：station 从 `project.stations` 取坐标，waypoint 从 `project.waypoints` 取坐标，按 `nodes` 顺序形成 `[lng, lat]`。异常悬空引用在开发模式下警告并跳过；少于两个有效节点不生成 LineString。正常 JSON 导入会先由 validation 拦截悬空引用。

导入与本地恢复依次执行 `JSON.parse` → `migrateProjectToCurrent()` → `validateProject()`。v1 线路的有序 `stationIds` 由纯函数转成 v2 station nodes，导入后内存与导出格式都为 v2。浏览器启动优先读取稳定键 `metro-planner.project`；没有时读取旧 v1 键，迁移并校验后先写新键，写入成功才删除旧键。失败时保留旧数据并在页面提示错误。
