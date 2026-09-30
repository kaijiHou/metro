# 项目 JSON 数据格式

当前格式版本：`1`。顶层必须是对象，包含 `version`、`name`、`stations` 和 `lines`。

```json
{
  "version": 1,
  "name": "武汉地铁规划",
  "stations": {
    "station-uuid-1": { "id": "station-uuid-1", "name": "光谷广场", "lng": 114.408, "lat": 30.506 }
  },
  "lines": {
    "line-uuid-1": { "id": "line-uuid-1", "name": "1号线", "color": "#d94c4c", "stationIds": ["station-uuid-1"] }
  }
}
```

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `version` | number | 必须为 `1` |
| `name` | string | 非空项目名 |
| `stations` | object | 键为稳定站点 ID，值为 Station；记录的 `id` 必须与键相同 |
| `Station.name` | string | 非空 |
| `Station.lng` | number | 有限数，范围 -180 到 180 |
| `Station.lat` | number | 有限数，范围 -90 到 90 |
| `lines` | object | 键为稳定线路 ID，值为 MetroLine；记录的 `id` 必须与键相同 |
| `MetroLine.name` | string | 非空 |
| `MetroLine.color` | string | 六位十六进制色，如 `#2878b9` |
| `MetroLine.stationIds` | string[] | 有序、不可重复，每个 ID 必须存在于 `stations` |

GeoJSON 和地图坐标顺序是 `[lng, lat]`。线路从 `stationIds` 的顺序生成直线段；不足两个有效站点时只显示站点，不绘制线路。同一站点 ID 可被多条线路引用，代表换乘。Station 没有 `isTransfer` 字段。Waypoint 尚未进入版本 1 格式。

导入和 localStorage 恢复先经过 `migrateProjectToCurrent`，再进入严格校验。Phase 1.1 已建立迁移管线，但当前仍只有 schema v1；缺失、格式错误或不受支持的 version 会被明确拒绝。未来增加 v2 时，版本转换将在迁移模块集中完成，不会把迁移规则散落到 UI。

导入出错时当前项目保持不变。未知附加字段会在校验后丢弃，导出的结构仅包含上述字段。
