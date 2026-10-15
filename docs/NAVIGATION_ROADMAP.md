# 下一阶段：GPS → 地铁 → 步行导航设计

**仅设计，当前未实现GPS、地址目的地、步行导航、乘车换乘或耗时计算；无可用导航UI。**

## 数据契约

未来NavigationPlan包含：origin(lat,lng,accuracy?)、destination(lat,lng,name)、accessWalk(from,entranceId,routeGeometry?,distanceM?,durationMin?,provider?)、metroLegs(lineId,direction,boardStationId,alightStationId,stopCount,durationMin?,intermediateStations?)、transfers(stationId,fromLine,toLine,estimatedMin?)、egressWalk(exitId,to,routeGeometry?,distanceM?,durationMin?,provider?)、totalDurationMin?、provenance(graphVersion?,transitScheduleSource?,pedestrianProvider?)。缺失值不补假数字。

## 前置条件

- 明确用户授权后才调用Geolocation API；要求HTTPS或localhost安全上下文，拒绝时允许手动起点。不默认保存GPS为足迹，也不默认上传坐标；第三方路由请求需说明隐私。
- 目的地必须消歧到具体地点/地址和坐标。统一WGS84、GCJ-02等转换并保留来源，禁止混坐标。
- 必须有可信运营车站/站序/支线/环线/方向/换乘及服务状态构图；Waypoint不是站，规划线不能当已开通列车。跨城/同名线路/同名站不自动合并。
- 步行道路/人行通道应来自许可明确的路由服务或真实路网，需要桥梁/过街/入口连接/无障碍约束。禁止使用Haversine直线冒充步行路线与时间。
- 进出站必须使用真实入口/出口坐标、开放状态与方向；站中心不能代替入口。最近出口未必总耗时最短。
- 地铁换乘/站内步行耗时需有可信来源或明确估计范围。缺班次、停运、关闭出口和无障碍数据时明确暂无，不暗示实时。

## 分期与验收

Phase 5A：出口关联质量、运营可达图、支线/环线方向与换乘测试。

Phase 5B：用户授权GPS、地址消歧、合法步行服务、入口选择及隐私说明。

Phase 5C：组合真实步行→进站→乘车→换乘→出站→真实步行、多备选及分段/总耗时、无障碍和异常降级；用真实路径验收而非画直线。用户另行要求后再实施，不随本期自动开始。
