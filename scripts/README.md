# 启动脚本

本目录存放本地启动入口和数据更新脚本，不存放业务代码、依赖包或运行产物。

Windows 用户双击 `start-metro.cmd` 即可启动项目并打开浏览器。需要 Node.js 24 或更新版本，并在项目根目录执行过 `npm ci`。脚本可自动使用本机已有的Codex Node24；开发服务同时启动共享旅行文件接口，无需再开一个数据库程序。

地址固定为 `http://127.0.0.1:5173/`。已经启动时只打开页面；首次启动后请保留运行窗口，关闭窗口即停止服务。端口被其他程序占用时会提示失败，不会自动切换到其他端口。

`update-transit.py` 更新城市线网快照；原始下载放在 `validation/transit-source/`，生成数据放在 `public/transit/`。

`fetch-trams.py` 从 OSM relation 下载电车网络，保留URL与响应SHA256；网络受限时可运行 GitHub Actions 的 Tram data 工作流。`build-trams.py <原始下载目录>` 根据明确核对的停站方向和换乘白名单生成 `src/data/trams.json`，不改原58个城市快照。不发布尚未核实的系统，详见补充数据README。原始文件放 `validation/tram-source/`。

`update-wuhan-service.py --refresh` 通过武汉地铁官网实际使用的公开只读接口获取首末班表，展开合并单元格、按日别和方向整理到 `src/data/wuhan-service.json`，并更新 `docs/WUHAN_SERVICE_TIMES.md`；去掉 `--refresh` 用验证目录缓存复现。原始响应放 `validation/wuhan-service/`，数据有URL、SHA256、来源发布日期和获取时间。遇到非预期表头会中止，不改项目和快照。电车参考资料在 `src/data/wuhan-tram-service.json` 人工维护，版本差异不能省略。
