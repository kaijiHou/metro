# 架构说明

## 数据与编辑状态

`App` 组合顶部项目操作、左侧模式、线路、站点与控制点面板和右侧 `MapCanvas`。Zustand 的 `metroStore` 保存唯一 `MetroProject` 与临时编辑状态。`createMetroStore()` 可创建隔离测试实例；生产 Store 订阅项目变化后自动保存。

`CitySearch` 结合 `CityNetworkPanel` 载入 `public/transit/` 内置城市线网或恢复城市副本；首次无保存项目时载入武汉，已有项目保持。未知城市使用 OpenStreetMap Nominatim 搜索定位地图。切换前保存当前项目，失败则保留；切换成功清空撤销历史，避免跨城市撤销。MapLibre 的 `moveend` 保存独立视角，地图视角不写入项目 JSON。

Phase 3 的 `status`、`visible`、`locked`、`sourceLineId` 是 schema v2 可选线路字段。内置现状线默认锁定；用户规划线叠加在同一个项目中。Store 在所有修改拓扑、移动或删除节点的入口检查锁定状态，地图 Marker 的拖动能力同步关闭。复制线路为规划线时复制控制点本体，站点继续共用现状站点；规划站位必须通过新建站点实现。`lineFeatureCollection()` 跳过隐藏线路，MapLibre 按状态用实线和不同线宽渲染；站名标签由 Symbol Layer 显示。

`statistics.ts` 计算沿节点路径的长度与站距。`scenarios.ts` 校验每城市最多五个完整项目快照；默认方案继续沿用旧城市存储键，额外方案保存在 `metro-planner.scenarios.<cityId>`。方案和城市切换都在保存当前项目后载入目标项目，清空 Undo/Redo 和临时选择，不重置地图视角。数据源更新时现有方案不会被自动替换。详见 [规划模型](PLANNING_MODEL.md)。

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

## Phase 4：隔离的全国浏览与出口

`viewStore` 只保存浏览 UI 状态与只读站点选择，不持久化到项目。`BrowseNetworkLoader` 独立保存有界 LRU（12 城）、待处理请求与 generation；并发最多4个，视口变化250ms防抖，范围按 catalog.bounds 相交选城。缓存容量不限制当下可见城市数量。失效请求取消，旧 generation 不发布。缓存和 GeoJSON 都不进入 MetroProject/Scenario/Undo。

沿用唯一 `MapCanvas`/MapLibre 实例，style.load 重建 sources/layers 并恢复当前数据。browse-cities、browse-lines、browse-stations、station-exits 与编辑 sources 隔离。zoom<7 为城市点，>=7 线路，>=10 站点，>=12 背景站名。浏览模式移除编辑 DOM Markers，切回增量恢复。当前规划城市去重；仅看现状时隐藏当前编辑 sources 并读取该城原始快照。禁用全国自动展示仍可显示当前城现状。

`CityNetworkPanel` 在浏览中只能定位；自定义项目、恢复快照、武汉补充等编辑入口受模式限制。模式变化不会重新触发曾经选择城市的加载。地图移动只保存可选地图视角，不调用 switchCity/loadProject。浏览时项目改名/新建/导入/撤销 UI 隐藏，Ctrl+Z/Y 不修改项目，Ctrl+S 仍可保存原方案。

`StationDetailDrawer` 为当前 cityId+stationId 的独立生命周期；新选择取消旧出口请求，清空图层；异步人工导入也验证当前选择，成功后取消尚未完成的在线请求。`ExitInfoService` 仅点击按需 Overpass 请求：超时20秒，真实请求起点至少间隔1.5秒；取消的等待不占未来时段。成功/空结果缓存24小时最多100站，失败不缓存，显式重试跳过缓存。Map 卸载取消请求/定时器，清理监听与 Marker，Map.remove 清理 sources/layers。

Phase 4B已接入下述旅行模块，业务数据仍与MetroProject隔离。

## Phase 4B：旅行独立视图

App主导航transit/travel存在viewStore，仅UI状态；旅行页面lazy加载，Dexie/JSZip不会拖入首次地铁页业务。Vite显式预优化这两个依赖，避免首次切页临时优化导致开发服务器刷新并丢会话撤销栈。旅行使用独立FootprintMap，切页卸载旧地图，不同时运行两个大型实例；App清除过期一次性定位target，原交通视角保留在已有独立视角键。

src/footprint分离只读adminCatalog/分区几何缓存、types、db/repository、imageProcessing、backup、FootprintPage/CityPhotoAlbum/TravelMemories和地图图层。旅行库没有MetroProject/metroStore业务依赖。MapLibre按cityCode promoteId与feature-state填色，真实省级轮廓仅展示；点击城市只选择、查相册，不点亮或自动放大。省份筛选才定位省级范围。style.load重建轮廓/标签/市级sources后恢复访问与选择状态，异步视口generation阻止旧加载覆盖新视野。

repo事务覆盖照片/封面一致性、删除修复、备份合并/覆盖。图片处理和ZIP验证在事务外完成，最终一次写入；事务失败回滚。组件读取有当前城市/卸载守卫，原图与缩略图ObjectURL清理，上传始终绑定发起城市。详情/底部回忆不复用其它城市的图。足迹异常显示独立消息，不改地铁通知或数据。

县级市足迹：旅行库主键兼容原市级与县级市；同一地图始终加载339个市级轮廓，省直辖县级市直接显示，其余县级市6.5级以上按视野载入过滤后的几何。litRegions根据真实子市到访派生父市着色，不写合成记录，统计、地图和详情采用同一规则。样式重建后恢复feature-state；仍为单一地图实例。省份清单覆盖34类。详见FOOTPRINT_COUNTY_UPGRADE.md。


## 本机共享旅行存储（2026-10-20，取代浏览器独立主库）

Vite插件`server/footprint-server.mjs`为开发服务及生产预览挂载本机API。Node24内置SQLite，默认`data/travel.sqlite`，同步事务/忙等待/DELETE事务日志；无常驻WAL文件。元数据、原图和缩略图共用单个数据库。读快照也用事务，跨服务连接取得一致备份。访问限loopback、同源及随机请求令牌，禁止数据库静态下载；私有目录不入Git。

`SharedFootprintRepository`提供现有FootprintStore契约；FootprintValidation复用领域校验，ZIP继续复用既有验证。浏览器旧Dexie库只作一次迁移输入，不是共享页写入目标。服务端迁移去重，按updatedAt选择新元数据并合并日期，删除标记抑制旧库复活；旧数据不清除。UI按revision两秒轮询与焦点刷新，未保存草稿保留，同城旧写入检测冲突。断线不切换独立数据库，不伪造空库或保存成功。SQLite操作与MetroProject业务隔离。

测试`phase4b_shared_flow.py`自行维护独立服务/目录，真实Chrome和Edge验证共享、旧库迁移、照片实际字节、ZIP和服务重启。测试目录及数据库不可加入public或提交。
