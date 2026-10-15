# 旅行足迹数据来源、许可与处理

## 行政边界与代码

- 数据集：OCHA/HDX China administrative boundaries COD-AB，来源公开在线资料，经ITOS核验；源不是官方法定界线。https://data.humdata.org/dataset/cod-ab-chn 。
- 已查询CKAN元数据：https://data.humdata.org/api/3/action/package_show?id=cod-ab-chn 。license_title为“Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)”，指向 https://creativecommons.org/licenses/by/3.0/igo/legalcode 。原始建立日期未知，资源标识2020；元数据称2024年10月复核、2025年1月更新元信息，不能解读为2026年现行行政区图。
- 几何直接使用原始 `chn_adm_ocha_2020_shp.zip`：https://data.humdata.org/dataset/17a2aaa2-dea9-4a2e-8b3f-92d1bdfb850c/resource/9e67ddf9-ce26-4b7a-82b1-51e5ca0714c8/download/chn_adm_ocha_2020_shp.zip 。坐标为原PRJ声明的WGS84。
- 中文码表 `chn_admgz_2020.xlsx`：https://data.humdata.org/dataset/17a2aaa2-dea9-4a2e-8b3f-92d1bdfb850c/resource/20eb7fd0-cf6b-4e05-af2d-7e124b6a37cc/download/chn_admgz_2020.xlsx 。
- 下载/核验日2026-10-15，原文件SHA256在public/footprint/catalog.json与sources.json。此前geoBoundaries候选不是最终几何来源，没有将县级2391单元冒充市级。

## 可复现处理

`scripts/build-footprint-data.py`用SHP每条ADM2_PCODE精确连接码表同字段，并逐条断言英语名、中文名、省级代码和层级一致；不存在用重名城市猜省份或仅按行号连接。稳定主键 `ocha2020-CN042120`（武汉）是版本化HDX代码，**不是GB/T 2260代码**。未来更换来源必须显式迁移映射，不能按名称覆盖旧记录。

对原始几何做有效性处理、6位小数坐标取整，保留真实Polygon/MultiPolygon及岛屿/洞；没有画圆或虚构边界。原莱芜市（已于2019年并入济南）区域union并入济南；那曲使用现名“那曲市”，源名称保留作别名。这些处理不保证补齐全部历史行政调整。

输出：33个按省分区的城市文件，合计339个市级区域，约2.36MB（未gzip），仅当地图视野涉及相应省级分组才读取并内存缓存；不会每次渲染重新解析全国大文件。34个真实省级轮廓单独提供总览与标签，省份没有“已到访”写入口。省级轮廓不能证明其全部市级边界可用。

支持地级市、自治州、盟、地区、直辖市全域、港澳各作为特别行政区展示单元。台湾只有整省源几何，**仅显示灰色省级轮廓，不能点亮为一个城市**；其市县级资料缺失。省直辖县级/副地级市、林区等21个源单元未纳入339分母，完整名单见catalog.missing；未纳入源单元数并不等于缺失市县总数。点到缺失区域会说明未收录，不创造记录。湖北为13个已支持地级单元，仙桃/潜江/天门/神农架等未纳入，不能照参考设计图复制17的分母。

UI地图署名、城市资料来源面板、README和本文件保留OCHA/HDX、ITOS、CC BY 3.0 IGO及处理说明。代码的MIT许可不覆盖这些数据，不暗示机构认可本项目。

## 系统默认照片

目前仅武汉：`public/footprint/wuhan-yellow-crane.jpg`，确认为黄鹤楼真实照片。

- 文件页：https://www.goodfreephotos.com/china/hubei/wuhan/yellow-crane-tower-in-the-city.jpg.php
- 原图：https://www.goodfreephotos.com/albums/china/hubei/wuhan/yellow-crane-tower-in-the-city.jpg
- 使用条款：https://www.goodfreephotos.com/pages/creative-commons-license-terms/
- 文件页标题/页脚标注“Public Domain photo / CC0”，条款明确可个人或商业项目使用，不必另询许可，并建议链接署名。图像元信息拍摄时间2017-05-29；未单列个人摄影者，因此UI诚实显示“GoodFreePhotos（文件页未单列摄影者）”，不编造作者。
- 取得日期2026-10-15，865755字节，SHA256见sources.json。不是搜索引擎缩略图，也未使用文件页中的商业图库推荐图片。
- 城市关联以武汉唯一cityCode决定；其它城市显示文字占位并声明非实拍，不复用武汉图。

个人上传图片由用户持有、仅保存在同源本地IndexedDB；不进入这些静态资源，不参与Git提交。自动化测试只上传程序生成的测试图，下载ZIP留忽略目录。

## 底图与地名

按用户最终方向，足迹页默认仅为中国/省市轮廓图，不使用街道、卫星影像或GPS。背景由本项目CSS/MapLibre生成，边界来自上述真实数据。省市轮廓、目录与武汉默认图均随项目保存在本机，由本地服务读取；地名使用已安装字体（MapLibre 6 本地字形），没有外部字体、样式或瓦片请求。断开互联网后只要本地服务仍运行，即可重新打开足迹页并切换省市，无需提前联网浏览或另下离线包。关闭本地服务后地址无法访问；未实现网站安装或 Service Worker 离线启动。

轨道交通地图仍使用原OpenFreeMap/OSM详细道路底图，目前需联网，没有全域瓦片离线包；其许可与出入口说明保持原样。足迹轮廓可离线不代表该详细底图或实时出口查询也可离线。
