import type { LineNode, MetroProject } from '../models/metro'
import { validateProject } from './validation'

// Approximate corridors only. Named anchors are regions, never invented stations.
type Anchor = string | [string, number, number]
type Corridor = { number: number; anchors: Anchor[]; note: string; part?: string; parentName?: string }
export const WUHAN_PLANNING_VERSION = 'wuhan-corridors-2026-10-14-v1'
const airport: Anchor = '天河机场'
const hanyang: Anchor = ['汉阳站规划区域', 114.09, 30.55]
const future: Anchor = ['光谷未来城区域', 114.58, 30.46]
const huangjia: Anchor = ['黄家湖区域', 114.29, 30.40]
const baiquan: Anchor = ['柏泉区域', 114.13, 30.74]
const wuhu: Anchor = '武湖'
const changfu: Anchor = ['常福区域', 114.04, 30.44]
const qianchuan: Anchor = ['前川区域', 114.37, 30.88]
const yangluo: Anchor = '阳逻'
const recent = '近期官方公开描述定位；精确站位仍未确定。'
const reference = '编号与走廊参考旧版公开资料，新版对应关系待核实。'
export const wuhanCorridors: Corridor[] = [
  { number: 9, anchors: ['武汉火车站', '杨春湖', ['武汉植物园区域',114.42,30.55], '光谷广场', ['民族大道区域',114.39,30.49], ['庙山区域',114.40,30.43], ['五里界区域',114.43,30.36]], note: '北段武汉站—植物园来自新版展示图的公开解读，待核实；南段沿民族大道、庙山至五里界参考公开规划。接入已有站为沙盘示意，不表示换乘已获批。' },
  { number: 10, anchors: [changfu, '东风公司', ['汉阳中心区域',114.25,30.55], '武汉商务区', '汉口火车站', '二七路', '武汉火车站', yangluo], note: '常福—汉阳—汉口—武昌—阳逻穿城快线走廊依据2026年市交通局公开介绍；只有部分区段在建，整条示意标为规划。' },
  { number: 13, anchors: [airport,'盘龙城','常青花园','汉口火车站',['汉正街区域',114.28,30.57],['南湖大道区域',114.35,30.49],'武汉东站','光谷五路',future], note: reference },
  { number: 14, anchors: [hanyang,['郭茨口区域',114.20,30.58],'古田二路','石桥',['后湖公园区域',114.29,30.65],wuhu,['武湖北区域',114.43,30.75]], note: '新汉阳站—武湖北、后湖公园区域有公开回复支持；中间走线是示意，非确定站位。' },
  { number: 15, anchors: ['宝通寺',['建安街区域',114.32,30.51],['罗家村区域',114.30,30.48],['乌龙泉区域',114.33,30.23],['山坡机场区域',114.36,30.09]], note: '北端宝通寺来自新版展示图公开解读，待核实；南段参考旧版山坡机场走廊。' },
  { number: 17, anchors: [hanyang,huangjia], note: '旧17号线在新公开资料中出现37号线编号。本条仅作南侧走廊候选，编号、分段关系待核实，不能与37号线视为已确认的两条独立线路。' },
  { number: 18, anchors: [['网安基地区域',114.10,30.68],'三店','金银湖','巨龙大道','汉口北',wuhu], note: reference },
  { number: 20, anchors: [airport,'腾龙大道','汉口北',['谌家矶区域',114.37,30.70],'武汉火车站'], note: recent },
  { number: 22, anchors: [['仓埠区域',114.57,30.84],yangluo,['双柳区域',114.69,30.57]], note: '仓埠—阳逻—双柳走廊有公开规划介绍，具体站位待核实。' },
  { number: 23, anchors: [baiquan,'金银湖','古田二路',['汉江湾区域',114.19,30.59],hanyang,['沌口区域',114.17,30.49],'汉阳火车站'], note: '按2025年新版修编答复及2026年官方回复：柏泉—金银湖—汉江湾—汉阳站/沌口—汉阳火车站。新汉阳枢纽与既有汉阳火车站是不同位置，不合并。' },
  { number: 24, anchors: [hanyang,['四新区域',114.21,30.52],['江盛路区域',114.29,30.51],['南湖北区域',114.36,30.50],'武汉东站',['光谷三路区域',114.47,30.46],['光谷南站规划区域',114.48,30.40]], note: reference },
  { number: 25, anchors: [qianchuan,wuhu,['天兴洲区域',114.44,30.68],'武汉火车站',['欢乐谷区域',114.39,30.60],'梨园'], note: '新版公开解读北段前川、南端改接梨园，待核实；欢乐谷/华侨城覆盖有旧版官方回复支持。' },
  { number: 26, anchors: [baiquan,'金银湖','古田四路',['龙阳湖区域',114.19,30.55],['四新区域',114.21,30.52],'东风公司',changfu], note: reference },
  { number: 27, anchors: [airport,['天阳路区域',114.31,30.74],wuhu,yangluo], note: '天河机场—阳逻走廊参考官方2019年介绍，编号与新版分段待核实。' },
  { number: 28, anchors: [qianchuan,'天阳大道','后湖大道'], note: '前川—后湖走廊参考公开资料，天阳大道有远期换乘设计说明；新版延长至长江新区站的线位待核实。' },
  { number: 29, anchors: [['关山大道区域',114.41,30.49],['光谷五路南段区域',114.50,30.43],future,'左岭'], note: '按2022年市政府公开走廊：关山大道—光谷五路—左岭；新版具体走向待核实。' },
  { number: 30, anchors: [huangjia,['汤逊湖区域',114.40,30.43],future,['红莲湖区域',114.64,30.43]], note: '黄家湖—光谷中心城南区—红莲湖走廊有市政府公开介绍，站位待核实。' },
  { number: 31, anchors: [['走马岭区域',114.02,30.64],['革新大道区域',114.12,30.61],['宜欣路区域',114.17,30.62],['汉西区域',114.23,30.60],'江汉路'], note: '革新大道、宜欣路覆盖有官方回复；走马岭和江汉路端点取自新版公开解读，待核实。' },
  { number: 32, anchors: [['张家湾区域',114.29,30.48],['青菱区域',114.28,30.44],['金口区域',114.14,30.32]], note: '金口走廊参考旧版资料；2024年官方回复明确站位未确定，示意控制点不代表车站。' },
  { number: 34, anchors: ['武汉火车站',['白玉山区域',114.50,30.63],yangluo,['桃桥湖区域',114.62,30.70]], note: '新港线远期走廊，34号线/S5命名存在不同规划口径；与10号线远期分拆关系待核实，不代表全段独立运营。' },
  { number: 35, anchors: ['金台',['邾城区域',114.80,30.85],['新洲东站规划区域',114.84,30.82]], note: '按2025年12月官方回复：邾城线金台—新洲东站。区域坐标为示意。' },
  { number: 37, anchors: [hanyang,['吴家山区域',114.13,30.62],'金银湖','盘龙城',airport], note: '按2025年黄陂区官方回复：17号线（37号线）汉阳站—吴家山—金银湖—盘龙城—天河站，机场接入仅示意，规划天河铁路站的精确站位待核实。' },
  { number: 3, part: '远期延伸', anchors: ['沌阳大道',['文岭区域',114.07,30.49]], note: '文岭方向参考官方建设规划；控制点不是批复站位。' },
  { number: 6, part: '远期延伸', anchors: ['东风公司',['博学路区域',114.13,30.51]], note: '博学路方向参考三期公开建设资料；只画走廊，不确定车站。' },
  { number: 8, part: '远期北延', anchors: ['金潭路','盘龙城','汉口北'], note: '盘龙城及汉口北方向参考公开规划，具体换乘及站位待核实。' },
  { number: 8, part: '远期南延', anchors: ['军运村',['大桥新区区域',114.32,30.39]], note: reference },
  { number: 11, part: '远期西延', anchors: ['江安路',['四新区域',114.21,30.52],hanyang], note: '汉阳站方向参考四期公开建设资料，控制点为区域示意。' },
  { number: 16, part: '远期北延', anchors: ['国博中心南',['墨水湖区域',114.22,30.54],['汉正街区域',114.28,30.57]], note: '汉正街方向参考旧版远期规划，新版走向待核实。' },
  { number: 19, part: '远期南延', anchors: ['新月溪公园',['光谷五路南段区域',114.50,30.43],['武汉新城站规划区域',114.54,30.39]], note: '光谷五路继续南延方向参考公开研究消息，新城铁路站的站位和线路关系待核实。' },
  { number: 21, part: '远期西延', parentName: '阳逻线', anchors: ['后湖大道','中一路'], note: '中一路方向参考公开延伸研究方案；共用现状阳逻线端点。' },
]

export function addWuhanPlanning(input: MetroProject): MetroProject {
  if (input.cityId !== 'wuhan') return input
  if (Object.values(input.lines).some((line) => line.sourceLineId === WUHAN_PLANNING_VERSION)) return input
  const project = structuredClone(input)
  const nine = Object.values(project.lines).filter((line) => !line.parentLineId && /^9号线$/.test(line.name)).map((line) => line.id)
  for (const line of Object.values(project.lines)) if (nine.includes(line.id) || (line.parentLineId && nine.includes(line.parentLineId))) delete project.lines[line.id]
  // Existing duplicates are unified by exact name, preferring a real-network record.
  const byName = new Map<string, string>()
  const remap = new Map<string, string>()
  for (const station of Object.values(project.stations).sort((a,b) => Number(b.id.startsWith('amap-')) - Number(a.id.startsWith('amap-')))) {
    const key = station.name.trim()
    const canonical = byName.get(key)
    if (canonical) { remap.set(station.id,canonical); delete project.stations[station.id] }
    else byName.set(key,station.id)
  }
  for (const line of Object.values(project.lines)) {
    const seen = new Set<string>()
    line.nodes = line.nodes.map((node) => node.type === 'station' ? { ...node, id: remap.get(node.id) ?? node.id } : node).filter((node) => {
      const key = `${node.type}:${node.id}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  }
  for (const corridor of wuhanCorridors) {
    const id = `wuhan-plan-${corridor.number}${corridor.part ? `-${corridor.part}` : ''}`
    const name = `${corridor.number}号线${corridor.part ?? ''}`
    if (project.lines[id] || Object.values(project.lines).some((line) => line.name === name)) continue
    const parent = corridor.part ? Object.values(project.lines).find((line) => line.name === (corridor.parentName ?? `${corridor.number}号线`) && !line.parentLineId) : undefined
    if (corridor.part && !parent) continue
    const nodes: LineNode[] = []
    for (const [index, anchor] of corridor.anchors.entries()) {
      if (typeof anchor === 'string') {
        const stationId = byName.get(anchor)
        // Missing known stations are not invented or snapped to nearby stations.
        if (stationId && !nodes.some((node) => node.type === 'station' && node.id === stationId)) nodes.push({ type: 'station', id: stationId })
      } else {
        let waypointId = `${id}-region-${index}`
        while (project.waypoints[waypointId]) waypointId += '-new'
        project.waypoints[waypointId] = { id: waypointId, name: `${anchor[0]}（示意控制点）`, lng: anchor[1], lat: anchor[2] }
        nodes.push({ type: 'waypoint', id: waypointId })
      }
    }
    project.lines[id] = { id, name, color: parent?.color ?? ['#b44763','#95713c','#428d78','#5178af','#9865a3'][corridor.number % 5], status: 'planned', visible: true, locked: false, nodes, ...(parent ? { parentLineId: parent.id } : {}),
      sourceLineId: WUHAN_PLANNING_VERSION, planningNote: `规划示意，非2024—2035批复方案的完整还原。${corridor.note} 凡换乘接入均共用既有站点，线路相交不自动视为换乘。` }
  }
  const usedWaypoints = new Set(Object.values(project.lines).flatMap((line) => line.nodes.filter((node) => node.type === 'waypoint').map((node) => node.id)))
  for (const id of Object.keys(input.waypoints)) if (!usedWaypoints.has(id) && Object.values(input.lines).some((line) => (nine.includes(line.id) || !!(line.parentLineId && nine.includes(line.parentLineId))) && line.nodes.some((node) => node.type === 'waypoint' && node.id === id))) delete project.waypoints[id]
  const usedStations = new Set(Object.values(project.lines).flatMap((line) => line.nodes.filter((node) => node.type === 'station').map((node) => node.id)))
  for (const line of Object.values(input.lines)) if (nine.includes(line.id) || !!(line.parentLineId && nine.includes(line.parentLineId))) {
    for (const node of line.nodes) if (node.type === 'station' && !usedStations.has(node.id)) delete project.stations[node.id]
  }
  return validateProject(project)
}
