# 项目 JSON 数据格式

当前格式版本为 `2`。项目包含独立的 `stations`、`waypoints` 和 `lines` 字典。线路只存放有序的 `nodes` 引用。

```json
{
  "version": 2,
  "name": "武汉地铁规划",
  "stations": {
    "s1": { "id": "s1", "name": "光谷广场", "lng": 114.408, "lat": 30.506 },
    "s2": { "id": "s2", "name": "武汉东站", "lng": 114.475, "lat": 30.510 }
  },
  "waypoints": {
    "w1": { "id": "w1", "lng": 114.445, "lat": 30.530 }
  },
  "lines": {
    "l1": {
      "id": "l1", "name": "1号线", "color": "#2878b9",
      "status": "planned", "visible": true, "locked": false,
      "nodes": [
        { "type": "station", "id": "s1" },
        { "type": "waypoint", "id": "w1" },
        { "type": "station", "id": "s2" }
      ]
    }
  }
}
```

| 字段 | 规则 |
| --- | --- |
| `version` | 必须为整数 `2` |
| `cityId` | 可选；载入内置城市线网时设为城市 ID，按城市隔离保存；自主规划省略。仅在地图搜索定位其他地点时，不改变此字段 |
| `name` | 非空项目名 |
| `stations` | Station 字典；键与记录 `id` 一致，`name` 非空，经纬度合法 |
| `waypoints` | Waypoint 字典；键与记录 `id` 一致，经纬度合法，没有 `name` |
| `lines` | MetroLine 字典；键与记录 `id` 一致，`name` 非空，`color` 为六位十六进制颜色 |
| `status` | 可选，`existing`、`construction` 或 `planned`；普通旧线路默认规划，旧城市 `amap-` 线路默认现状 |
| `visible` | 可选布尔值；省略时显示，隐藏不删除数据 |
| `locked` | 可选布尔值；内置及旧城市现状线默认锁定 |
| `sourceLineId` | 可选非空字符串；规划副本指向原线路 ID |
| `closed` | 每条线路可选布尔值；为 `true` 时最后一个节点与第一个节点相连，供环线使用 |
| `nodes` | 有序的 LineNode 数组；同一线路内不可重复相同 `type + id` |
| Station node | `{ "type": "station", "id": "s1" }`，ID 必须存在于 `stations` |
| Waypoint node | `{ "type": "waypoint", "id": "w1" }`，ID 必须存在于 `waypoints` |

经度 `lng` 为 -180 到 180，纬度 `lat` 为 -90 到 90，均须为有限数。GeoJSON 坐标顺序为 `[lng, lat]`，依照 `nodes` 顺序连接；不足两个有效节点时不绘制 LineString。只有同一个 Station 被多条线路引用才显示为换乘站。Waypoint 只改变线路几何形状，不显示在站点列表，也不计入换乘。

从线路移除 Station node 时保留 Station 本体；删除 Station 本体时清除所有线路引用。从线路移除 Waypoint node 时，仍被其他线路引用的 Waypoint 保留，否则自动删除。删除 Waypoint 本体时清除所有线路引用。删除线路时也清理因此失去最后引用的 Waypoint，站点仍保留。

## v1 迁移

导入 v1 JSON 或读取旧浏览器键 `metro-planner.project.v1` 时，先由 `migrateProjectToCurrent()` 调用纯函数 `migrateV1ToV2()`。每条旧线路的 `stationIds` 按原顺序转换为 station nodes，`waypoints` 初始化为 `{}`；项目名称、站点和线路 ID、名称、颜色保留。迁移不修改输入对象。随后 `validateProject()` 严格校验 v2，失败时不替换当前项目。

浏览器使用稳定键 `metro-planner.project` 保存当前项目，schema 版本由 JSON 内部 `version` 决定。各城市副本使用 `metro-planner.city.<cityId>`，自主规划使用 `metro-planner.city.custom`，选择城市时恢复相应副本。多方案另存于 `metro-planner.scenarios.<cityId>` 或 `metro-planner.scenarios.custom`，每个城市最多 5 个完整项目。启动时优先读取稳定键；若不存在才读取旧 v1 键。旧项目成功迁移、校验并写入稳定键后，才删除旧键。旧数据损坏或新键写入失败时保留旧数据并显示错误提示。导出始终为 v2，导出内容为当前方案。

未知附加字段会在校验后丢弃；v2 线路若仍含旧 `stationIds` 字段会被拒绝。小型示例位于 `validation/fixtures/`。
