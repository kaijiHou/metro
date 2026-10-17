# 区县足迹数据

本目录存放可独立点亮的区、县、县级市等县级单元边界、中文目录和来源审计。不得放入用户照片、个人到访记录或下载原件。

按用户最新要求，界面只展示其中 352 个已核对县级市；普通县、市辖区隐藏。源目录的 2467 个已核对县级单元用于审计和保持 ID 可追溯，不等于界面展示数量。东莞、中山、儋州等地级市占位条目不能当成县级市。县级市显示名称参照固定中文码表，几何仍为2017历史版本，不承诺现行全覆盖。

几何：geoBoundaries gbOpen CHN ADM3，固定版本 9469f09，表示年份 2017，原始来源 Lee Beryman / OpenStreetMap，ODbL 1.0。衍生边界数据库继续按 ODbL 1.0 提供；使用时署名 OpenStreetMap contributors 和 geoBoundaries，保留来源与修改说明。

中文名称：modood/Administrative-divisions-of-China，固定提交 c49d495b40ac73eb1a66f6eeae5f8fd10696f035，WTFPL v2。中文匹配限于同省且唯一的拼音与上级市核验结果；不明确的记录排除并列入 audit.json，不能猜测同名区域。省、市归属按最大几何交叠核对并记录比例，不代表当前法定归属认定。

重建：项目根目录运行 `.venv/Scripts/python.exe scripts/build-footprint-counties.py`。依赖见 validation/footprint-data-requirements.txt。原件放在忽略提交的 validation/phase4b-*.geojson；本目录为处理后可发布的数据。来源 URL、SHA256、数量、排除项见 sources.json / audit.json。不宣称全国当前行政区划全覆盖。
