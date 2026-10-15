# 站点详情与出入口基础版

## 使用和数据来源

浏览模式点击站点或站名查看所属城市、线路和快照来源，再按需查询 OSM。其它城市背景站点在规划模式也只打开只读详情。第三方数据不完整且可能变化，不能代替现场标识/运营方公告。

- 来源：OpenStreetMap，© OpenStreetMap contributors，ODbL；https://www.openstreetmap.org/copyright 。
- 对象：railway=subway_entrance 的 node；https://wiki.openstreetmap.org/wiki/Tag:railway%3Dsubway_entrance 。
- 关联：https://wiki.openstreetmap.org/wiki/Metro_Mapping 。只有明确属于匹配 public_transport=stop_area 关系的入口成员才显示。
- 服务：https://overpass-api.de/api/interpreter ，按用户点击POST查询，20秒超时；https://dev.overpass-api.de/overpass-doc/en/preface/commons.html 。

已有明确relationId时匹配该关系，标记“站区关系已关联”；当前快照通常无OSM relationId，因此以650米内同名站区候选关联，标为“待核实”。处理name、name:zh、name:zh-Hans、official_name、alt_name以及分号别名；关系成员出口还检查有效坐标及站点附近约0.025度的保守范围。坐标经过源数据转换仍可能存在偏差，候选关联不等于已独立核实。没有站区关系时宁可缺失，不把附近其它站的入口分配给本站。

## 显示边界

仅展示实际数据里的ref/name/坐标/wheelchair。无编号显示“未编号出入口”，无exit_to显示“出口方向暂未收录”，缺失显示“暂无可靠出口数据；不代表本站没有出口”。页面显示查询时间，而不是假称运营方更新时间。出口地图标签若无ref/name使用列表顺序“出口1”，不是编造A/B编号。

同城同站出口采用OSM稳定node ID去重；cityId、stationId一起隔离跨城同名站。不计算直线冒充步行、时间、入口最优选择或GPS导航。用户选择站点时会向Overpass发送该站坐标，不发送浏览器位置或个人照片。

成功结果（含空）24小时内存缓存，最多100站；失败不缓存，可手动重试绕过缓存。请求间隔至少1.5秒，取消/换站不排出长串无用等待。刷新后缓存清空。公共OSM服务可能超时或限流；真实覆盖不能由模拟测试推断。

## 人工资料导入

展开“导入出口资料”，查看当前cityId、stationId；导入有权使用的JSON数组（<=100KB、<=100条）。每条包含 cityId、stationId、lng、lat，可选 id、ref、name、exitTo文字数组、wheelchair、https来源链接。记录必须属于当前站、有效经纬度且靠近站点，重复ID拒绝。所有导入都标为“用户补录，未核实”，不会因为JSON写了official/verified就提升可信度。本次查看有效，切换站点或刷新不持久化；不写入MetroProject。

自动化测试使用明确模拟的关系/出口响应验证UI。一次真实长沙附近Overpass请求的结果记录在validation/phase4-live-osm.json；其失败或局部结果都不代表全国覆盖。
