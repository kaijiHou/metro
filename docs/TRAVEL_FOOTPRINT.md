# 市级旅行足迹：尚未实现

本次按Phase 4任务允许的分步范围先交付全国地铁漫游与出入口。市级点亮、城市详情/相册、默认黄鹤楼图、Dexie、IndexedDB以及ZIP备份/恢复均未实现、未验收，没有可用入口。现有规划JSON导出不包含照片，也不能冒充旅行备份。

## 已做的资料研究与未通过的门槛

- geoBoundaries gbOpen CHN ADM2为2391个单元，检查后属于县级，不能直接标作市级足迹。
- gbHumanitarian CHN ADM2（boundaryID CHN-ADM2-99377448，2020，361个单元，提交9469f09）标注 CC BY 3.0 IGO，来源HDX公开资料：https://www.geoboundaries.org/api/current/gbHumanitarian/CHN/ADM2/ 、https://data.humdata.org/dataset/cod-ab-chn 。
- 检查候选文件发现台湾为一整个“Taiwan province”几何，不能作为市级；缺少中文省市与稳定行政代码完整映射。未经映射审计不能发布为全国城市目录。
- 候选原始边界仅留本地validation/phase4-china-adm2.geojson，已忽略版本控制，不发布不完整数据。尚未核验可发布的武汉默认照片，仓库未增加照片资源。

## 后续完成条件

市为最小单位，地级市/自治州/盟/地区逐一有稳定代码与真实边界；直辖市整体视为市级，港澳适用粒度需文档化，台湾应采用可追溯市/县级几何或明确缺失，不能全省代替一市。无地铁地区也必须能点亮。使用MapLibre Fill/Outline，省份只汇总；取消点亮不删照片。

独立Dexie库MetroFootprintDB：visits(cityCode,status,visitedDates,note,coverPhotoId,updatedAt)、photos(photoId,cityCode,blob,thumbnailBlob,mimeType,fileName,caption,takenAt,sortOrder,createdAt)、settings(key,value)。跨城隔离，删除封面用事务修复引用。JPEG/PNG/WebP验证和缩略图生成、多文件逐项反馈、配额/禁用存储错误都需实现与验证。

默认图片必须逐城核验许可与署名；武汉需真实授权黄鹤楼图，其余没有授权图时显示专属占位，不借其它城市图片。全部/默认/我的照片是同一相册过滤，不复制数据。用户照片留本地Blob，禁止Git/第三方自动上传。

ZIP应包含manifest和photos二进制；路径遍历、重复ID、未知城市、跨城归属、大小/数量/解压限制、封面完整性均需验证，提供合并/覆盖并事务回滚；需完整导出→导入往返测试后才可交付。

## 将来存储的用户说明

IndexedDB将是浏览器本地数据库，不是D:\metro文件，也不是云同步；localhost、127.0.0.1、端口和浏览器profile分别隔离。清理网站数据可能丢失记录，申请persist也不保证永久保存。将来必须提供ZIP主动备份。**这些是后续要求，目前并未创建该数据库。**
