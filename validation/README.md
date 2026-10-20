# 验证脚本和结果

本目录存放可复现的自动化验证入口和小型结果 JSON。日志、截图、合成备份和临时数据库不进入 Git。

当前本机共享资料验证：`.venv\Scripts\python.exe validation\phase4b_shared_flow.py`。
此脚本用独立目录、独立 Chrome/Edge 资料和5175端口，自行启动、重启、停止服务，不操作个人数据库。
`shared-storage/` 内每次测试有单独目录、说明、合成数据库、日志和截图，不应放入真实用户资料。

`phase4b_production_flow.py` 用于5174端口的`/metro/`生产预览；必须将预览服务的
`METRO_DATA_DIR` 设置到本目录 `shared-storage/` 下的隔离目录。脚本会拒绝个人数据库。
旧 `phase4b_footprint_flow.py`、`phase4b_county_flow.py`、`phase4b_hover_offline_flow.py`
只作历史浏览器存储检查留档，运行时会提示改用新隔离用例，当前交互与存储由新用例验证。

不要将个人足迹、照片、恢复包、凭据或实际浏览器配置文件放入本目录。
