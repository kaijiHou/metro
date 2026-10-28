import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { INITIAL_CENTER, INITIAL_ZOOM, MAP_STYLE_URL, type MapTarget } from '../config/map'
import { useMetroStore } from '../store/metroStore'
import { lineFeatureCollection, nearestLineInsertIndex, stationFeatureCollection, stationLabelCollection } from '../utils/geojson'
import { lockedNodeIds, lineStatus, rootLine, statusNames } from '../utils/planning'
import { validCoordinates } from '../utils/validation'
import { useViewStore } from '../store/viewStore'
import { BrowseNetworkLoader,type BrowseResult } from '../services/browseNetworkLoader'
import { addBrowseLayers,syncBrowseLayers,syncExitLayers } from '../services/mapBrowseLayers'
import { cityMapTarget,fetchCityCatalog,type TransitCity } from '../utils/transit'
import type { BrowseStation } from '../utils/browseGeojson'
import type { StationExit } from '../models/exits'
import { StationDetailDrawer } from './StationDetailDrawer'
import {addJourneyLayers,syncJourneyLayers} from '../services/mapJourneyLayers'
import {tramPreview} from '../utils/trams'

maplibregl.setWorkerUrl(mapWorkerUrl)

const MAP_VIEW_KEY = 'metro-planner.map-view'

function initialMapView(): { center: [number, number]; zoom: number } {
  try {
    const raw = localStorage.getItem(MAP_VIEW_KEY)
    if (raw) {
      const view: unknown = JSON.parse(raw)
      if (typeof view === 'object' && view !== null && 'center' in view && 'zoom' in view &&
          Array.isArray(view.center) && view.center.length === 2 &&
          typeof view.center[0] === 'number' && typeof view.center[1] === 'number' &&
          validCoordinates(view.center[0], view.center[1]) && typeof view.zoom === 'number' &&
          Number.isFinite(view.zoom) && view.zoom >= 1 && view.zoom <= 20) {
        return { center: [view.center[0], view.center[1]], zoom: view.zoom }
      }
    }
  } catch {
    // Map position is an optional browser preference.
  }
  const station = Object.values(useMetroStore.getState().project.stations)[0]
  return station ? { center: [station.lng, station.lat], zoom: INITIAL_ZOOM } : { center: INITIAL_CENTER, zoom: INITIAL_ZOOM }
}

type MarkerRecord = {
  marker: Marker
  element: HTMLButtonElement
}

function markerClass(transfer: boolean, selected: boolean): string {
  return `map-station${transfer ? ' map-station--transfer' : ''}${selected ? ' map-station--selected' : ''}`
}

function mergeTarget(map: MapLibreMap, markers: Map<string, MarkerRecord>, sourceId: string, point: maplibregl.Point): string | null {
  let target: string | null = null, distance = 22
  for (const [id, record] of markers) {
    if (id === sourceId) continue
    const d = map.project(record.marker.getLngLat()).dist(point)
    if (d < distance) { distance = d; target = id }
  }
  if (!target && map.getLayer('metro-station-labels')) {
    target = map.queryRenderedFeatures(point, { layers: ['metro-station-labels'] })
      .map((feature) => feature.properties?.id).find((id) => typeof id === 'string' && id !== sourceId && markers.has(id)) ?? null
  }
  return target
}

function previewMerge(map: MapLibreMap, markers: Map<string, MarkerRecord>, sourceId: string, point: maplibregl.Point) {
  const target = mergeTarget(map, markers, sourceId, point)
  for (const [id, record] of markers) {
    record.element.classList.toggle('map-station--merge-target', id === target)
    if (id === target) record.element.dataset.mergeName = `松开合并到 ${useMetroStore.getState().project.stations[id].name}`
  }
  map.getCanvas().title = target ? `松开合并到 ${useMetroStore.getState().project.stations[target].name}` : '拖到另一个站点或站名上松开，即可合并'
}

function finishStationDrag(map: MapLibreMap, markers: Map<string, MarkerRecord>, sourceId: string, point: maplibregl.Point, coordinate: maplibregl.LngLat) {
  const state = useMetroStore.getState()
  const target = mergeTarget(map, markers, sourceId, point)
  if (target) state.mergeStations(sourceId, target)
  else state.updateStation(sourceId, { lng: coordinate.lng, lat: coordinate.lat })
  for (const record of markers.values()) record.element.classList.remove('map-station--merge-target')
  map.getCanvas().title = ''
  const source = useMetroStore.getState().project.stations[sourceId]
  if (source) markers.get(sourceId)?.marker.setLngLat([source.lng, source.lat])
}

function syncStationMarkers(map: MapLibreMap, markers: Map<string, MarkerRecord>) {
  const { project, selectedStationId, selectedStationIds, editorMode } = useMetroStore.getState()
  const protectedIds = lockedNodeIds(project, 'station')
  const currentIds = new Set<string>()
  for (const feature of stationFeatureCollection(project, selectedStationId).features) {
    const stationId = feature.properties.id
    const station = project.stations[stationId]
    currentIds.add(stationId)
    let record = markers.get(stationId)
    if (!record) {
      const element = document.createElement('button')
      element.type = 'button'
      element.addEventListener('mousedown', () => {
        const state = useMetroStore.getState()
        if (state.editorMode !== 'browse' || !lockedNodeIds(state.project, 'station').has(stationId)) return
        state.selectStation(stationId)
        state.setNotice('这个站点已锁定，点击地图上的“解锁并拖动”后即可移动或合并。')
      })
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        const state = useMetroStore.getState()
        if (state.editorMode === 'add-station' && state.selectedLineId) {
          const line = state.project.lines[state.selectedLineId]
          if (line?.nodes.some((node) => node.type === 'station' && node.id === stationId)) {
            state.setNotice(`${state.project.stations[stationId]?.name ?? '这个站'} 已在当前线路中。`, 'info')
          } else {
            state.addStationToLine(stationId, state.selectedLineId, state.extensionEnd === 'start' ? 0 : undefined)
          }
        } else state.selectStation(stationId)
      })
      const marker = new maplibregl.Marker({ element, draggable: true, anchor: 'center' })
        .setLngLat([station.lng, station.lat])
        .addTo(map)
      marker.on('dragend', () => {
        const state = useMetroStore.getState()
        if (!state.project.stations[stationId]) return
        const coordinate = marker.getLngLat()
        finishStationDrag(map, markers, stationId, map.project(coordinate), coordinate)
      })
      marker.on('drag', () => previewMerge(map, markers, stationId, map.project(marker.getLngLat())))
      record = { marker, element }
      markers.set(stationId, record)
    }

    const position = record.marker.getLngLat()
    if (position.lng !== station.lng || position.lat !== station.lat) {
      record.marker.setLngLat([station.lng, station.lat])
    }
    const selected = feature.properties.selected || (editorMode === 'select-stations' && selectedStationIds.includes(stationId))
    record.element.className = `${markerClass(feature.properties.transfer, selected)}${protectedIds.has(stationId) ? ' map-station--locked' : ''}`
    record.element.setAttribute('aria-pressed', String(selected))
    record.marker.setDraggable(editorMode !== 'select-stations' && editorMode !== 'add-station' && !protectedIds.has(stationId))
    record.element.title = `${station.name}${feature.properties.transfer ? ' · 换乘站' : ''}${protectedIds.has(stationId) ? ' · 已锁定，点击后可解锁拖动' : ' · 可拖动到另一站合并'}${editorMode === 'add-station' ? ' · 点击接入当前线路' : ''}`
    record.element.setAttribute('aria-label', `${editorMode === 'add-station' ? '加入站点' : '选择站点'} ${station.name}`)
  }

  for (const [stationId, record] of markers) {
    if (currentIds.has(stationId)) continue
    record.marker.remove()
    markers.delete(stationId)
  }
}

function syncWaypointMarkers(map: MapLibreMap, markers: Map<string, MarkerRecord>) {
  const { project, selectedWaypointId, selectedLineId } = useMetroStore.getState()
  const protectedIds = lockedNodeIds(project, 'waypoint')
  const selectedNodes = new Set(selectedLineId ? project.lines[selectedLineId]?.nodes.map((node) => node.id) : [])
  const visibleIds = new Set<string>()
  for (const waypoint of Object.values(project.waypoints)) {
    if (waypoint.name?.includes('示意控制点') && !selectedNodes.has(waypoint.id)) continue
    visibleIds.add(waypoint.id)
    let record = markers.get(waypoint.id)
    if (!record) {
      const element = document.createElement('button')
      element.type = 'button'
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        useMetroStore.getState().selectWaypoint(waypoint.id)
      })
      const marker = new maplibregl.Marker({ element, draggable: true, anchor: 'center' })
        .setLngLat([waypoint.lng, waypoint.lat]).addTo(map)
      marker.on('dragend', () => {
        const state = useMetroStore.getState()
        if (!state.project.waypoints[waypoint.id]) return
        const { lng, lat } = marker.getLngLat()
        state.updateWaypoint(waypoint.id, { lng, lat })
      })
      record = { marker, element }
      markers.set(waypoint.id, record)
    }
    const position = record.marker.getLngLat()
    if (position.lng !== waypoint.lng || position.lat !== waypoint.lat) record.marker.setLngLat([waypoint.lng, waypoint.lat])
    record.element.className = `map-waypoint${selectedWaypointId === waypoint.id ? ' map-waypoint--selected' : ''}`
    record.marker.setDraggable(!protectedIds.has(waypoint.id))
    record.element.title = `${waypoint.name ?? '控制点'} · ${protectedIds.has(waypoint.id) ? '已锁定' : '拖动调整线路'}`
    record.element.setAttribute('aria-label', '选择控制点')
  }
  for (const [id, record] of markers) {
    if (visibleIds.has(id)) continue
    record.marker.remove()
    markers.delete(id)
  }
}

export function MapCanvas({ target }: { target: MapTarget | null }) {
  const presentationMode = useViewStore((state)=>state.presentationMode)
  const setPresentationMode = useViewStore((state)=>state.setPresentationMode)
  const autoNetworks = useViewStore((state)=>state.autoNetworks)
  const existingOnly = useViewStore((state)=>state.existingOnly)
  const browseStation = useViewStore((state)=>state.station)
  const journey = useViewStore((state)=>state.journey)
  const [catalog,setCatalog]=useState<TransitCity[]>([])
  const [browseResult,setBrowseResult]=useState<BrowseResult>({projects:{},loading:[],errors:{}})
  const [catalogError,setCatalogError]=useState('')
  const [basemapUnavailable,setBasemapUnavailable]=useState(false)
  const catalogRef=useRef(catalog)
  const resultRef=useRef(browseResult)
  const loaderRef=useRef<BrowseNetworkLoader|null>(null)
  const retryCatalogRef=useRef<()=>void>(()=>{})
  const reloadRef=useRef<()=>void>(()=>{})
  const exitsRef=useRef<StationExit[]>([])
  const presentationRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Map<string, MarkerRecord>>(new Map())
  const waypointMarkersRef = useRef<Map<string, MarkerRecord>>(new Map())
  const project = useMetroStore((state) => state.project)
  const selectedLineId = useMetroStore((state) => state.selectedLineId)
  const selectedStationId = useMetroStore((state) => state.selectedStationId)
  const selectedStationIds = useMetroStore((state) => state.selectedStationIds)
  const selectedWaypointId = useMetroStore((state) => state.selectedWaypointId)
  const editorMode = useMetroStore((state) => state.editorMode)

  useEffect(() => useMetroStore.subscribe((state, previous) => {
    if (state.editorMode !== 'browse' && state.editorMode !== previous.editorMode) {
      presentationRef.current = false
      setPresentationMode(false)
    }
  }), [setPresentationMode])
  const stationLabelMode = useMetroStore((state) => state.stationLabelMode)
  const pendingInsertIndex = useMetroStore((state) => state.pendingInsertIndex)

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return
    const markerRecords = markersRef.current
    const waypointMarkerRecords = waypointMarkersRef.current
    const initialView = initialMapView()
    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE_URL,
      center: initialView.center,
      zoom: initialView.zoom,
    })
    mapRef.current = map
    const loader=new BrowseNetworkLoader()
    loaderRef.current=loader
    const catalogController=new AbortController()
    const loadCatalog=()=>{setCatalogError('');void fetchCityCatalog(catalogController.signal).then((cities)=>{if(!catalogController.signal.aborted){catalogRef.current=cities;setCatalog(cities);reloadRef.current()}}).catch((error)=>{if(!catalogController.signal.aborted)setCatalogError(error instanceof Error?error.message:'城市目录暂不可用')})}
    retryCatalogRef.current=loadCatalog
    loadCatalog()
    let loadTimer:ReturnType<typeof setTimeout>|undefined
    const refreshNetworks=()=>{
      clearTimeout(loadTimer)
      loadTimer=setTimeout(()=>{
        const bounds=map.getBounds()
        const view=useViewStore.getState()
        const visibleCatalog=view.autoNetworks?catalogRef.current:catalogRef.current.filter((city)=>view.presentationMode&&view.existingOnly&&city.id===useMetroStore.getState().project.cityId)
        void loader.update(visibleCatalog,{west:bounds.getWest(),south:bounds.getSouth(),east:bounds.getEast(),north:bounds.getNorth(),zoom:map.getZoom()},view.presentationMode&&view.existingOnly?undefined:useMetroStore.getState().project.cityId,view.autoNetworks||(view.presentationMode&&view.existingOnly),(next)=>{resultRef.current=next;setBrowseResult(next);syncBrowseLayers(map,next,view.autoNetworks?catalogRef.current:[],useMetroStore.getState().project)})
      },250)
    }
    reloadRef.current=refreshNetworks
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    const onLoad = () => {
      const transit = map.getStyle().layers.find((layer) => layer.id === 'poi_transit')
      if (transit?.type === 'symbol') {
        map.setFilter('poi_transit', ['match', ['get', 'class'], ['airport', 'bus'], true, false])
        map.addLayer({ ...transit, id: 'metro-basemap-station-labels', filter: ['==', ['get', 'class'], 'rail'],
          layout: { ...transit.layout, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 15, 15, 18, 18, 20] },
          paint: { ...transit.paint, 'text-color': '#193b4c', 'text-halo-color': '#ffffff', 'text-halo-width': 2.5 } })
      }
      map.addSource('metro-station-labels', { type: 'geojson', data: stationLabelCollection(useMetroStore.getState().project, presentationRef.current ? 'all' : useMetroStore.getState().stationLabelMode, useMetroStore.getState().selectedLineId) })
      map.addSource('metro-lines', { type: 'geojson', data: lineFeatureCollection(useMetroStore.getState().project, presentationRef.current ? null : useMetroStore.getState().selectedLineId) })
      map.addLayer({
        id: 'metro-line-shadow',
        type: 'line',
        source: 'metro-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'selected'], 10, 8], 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'metro-lines',
        type: 'line',
        source: 'metro-lines',
        filter: ['!=', ['get', 'status'], 'construction'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 7, ['==', ['get', 'status'], 'planned'], 6, 4], 'line-opacity': ['case', ['get', 'selected'], 1, 0.75] },
      })
      map.addLayer({
        id: 'metro-construction-lines', type: 'line', source: 'metro-lines',
        filter: ['==', ['get', 'status'], 'construction'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 7, 4], 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'metro-line-labels', type: 'symbol', source: 'metro-lines',
        layout: {
          'symbol-placement': 'line', 'symbol-spacing': 220,
          'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
          'text-size': 13, 'text-offset': [0, -0.9], 'text-max-angle': 60,
        },
        paint: { 'text-color': '#193b4c', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      })
      map.addLayer({ id: 'metro-station-labels', type: 'symbol', source: 'metro-station-labels', minzoom: 11.5,
        layout: { visibility: 'visible', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 15, 15, 18, 18, 20], 'text-anchor': 'left', 'text-offset': [1, 0],
          'text-allow-overlap': ['step', ['zoom'], false, 14, true], 'text-ignore-placement': ['step', ['zoom'], false, 14, true], 'text-padding': 2 },
        paint: { 'text-color': '#193b4c', 'text-halo-color': '#ffffff', 'text-halo-width': 2.5 },
      })
      addBrowseLayers(map)
      addJourneyLayers(map)
      syncJourneyLayers(map,useViewStore.getState().journey)
      map.setLayoutProperty('metro-readonly-stations','visibility',presentationRef.current?'visible':'none')
      if(presentationRef.current&&useViewStore.getState().existingOnly){(map.getSource('metro-lines') as GeoJSONSource).setData({type:'FeatureCollection',features:[]});(map.getSource('metro-station-labels') as GeoJSONSource).setData({type:'FeatureCollection',features:[]})}
      syncBrowseLayers(map,resultRef.current,useViewStore.getState().autoNetworks?catalogRef.current:[],useMetroStore.getState().project)
      syncExitLayers(map,exitsRef.current)
      refreshNetworks()
    }
    let ignoreLabelClick = false
    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      if (ignoreLabelClick) { ignoreLabelClick = false; return }
      const readLayers=['browse-station-points','browse-station-names',...(presentationRef.current?['metro-readonly-stations','metro-station-labels']:[])].filter((id)=>map.getLayer(id))
      const readonly=readLayers.length?map.queryRenderedFeatures(event.point,{layers:readLayers})[0]:undefined
      if(readonly&&readonly.geometry.type==='Point'){
        const properties=readonly.properties??{}
        const current=useMetroStore.getState().project
        const stationId=String(properties.stationId??properties.id)
        const isBackground=typeof properties.cityId==='string'
        const cityId=isBackground?properties.cityId:current.cityId??'custom'
        const city=catalogRef.current.find((item)=>item.id===cityId)
        const lineNames=isBackground?JSON.parse(String(properties.lineNames??'[]')) as string[]:[...new Set(Object.values(current.lines).filter((line)=>line.nodes.some((node)=>node.type==='station'&&node.id===stationId)).map((line)=>rootLine(current,line).name))]
        const selected:BrowseStation={id:stationId,name:String(properties.name),lng:readonly.geometry.coordinates[0],lat:readonly.geometry.coordinates[1],cityId,cityName:city?.name??current.name,lineNames,sourceUrl:isBackground?String(properties.sourceUrl):city?.sourceUrl??'',querySource:isBackground?'snapshot':'project'}
        useViewStore.getState().setStation(selected);return
      }
      if(presentationRef.current){
        const cityPoint=map.getLayer('browse-city-points')?map.queryRenderedFeatures(event.point,{layers:['browse-city-points','browse-city-names']})[0]:undefined
        const city=catalogRef.current.find((item)=>item.id===cityPoint?.properties?.id)
        if(city)map.fitBounds(city.bounds,{padding:60,maxZoom:12})
        return
      }
      const state = useMetroStore.getState()
      if (state.editorMode === 'add-station') state.createStation(event.lngLat.lng, event.lngLat.lat)
      else if (state.editorMode === 'add-waypoint' && state.selectedLineId) {
        let insertIndex = state.pendingInsertIndex ?? undefined
        if (insertIndex === undefined && (state.project.lines[state.selectedLineId]?.nodes.length ?? 0) >= 2) {
          if (!map.getLayer('metro-lines')) return
          const pad = 10
          const features = map.queryRenderedFeatures(
            [[event.point.x - pad, event.point.y - pad], [event.point.x + pad, event.point.y + pad]],
            { layers: ['metro-lines', 'metro-construction-lines'] },
          )
          if (!features.some((feature) => feature.properties?.id === state.selectedLineId)) {
            state.setNotice('请点击当前线路上的一段，再拖动新控制点调整走向。', 'info')
            return
          }
          insertIndex = nearestLineInsertIndex(
            state.project,
            state.selectedLineId,
            [event.lngLat.lng, event.lngLat.lat],
            ([lng, lat]) => { const point = map.project([lng, lat]); return [point.x, point.y] },
          ) ?? undefined
        }
        state.createWaypoint(event.lngLat.lng, event.lngLat.lat, state.selectedLineId, insertIndex)
      } else if (state.editorMode !== 'select-stations') {
        if (map.getLayer('metro-lines')) {
          const feature = map.queryRenderedFeatures(event.point, { layers: ['metro-lines', 'metro-construction-lines'] })[0]
          if (typeof feature?.properties?.id === 'string') { state.selectLine(feature.properties.id); return }
        }
        state.selectStation(null)
        state.selectWaypoint(null)
      }
    }
    let labelDrag: { id: string; start: maplibregl.Point; moved: boolean } | null = null
    const onLabelDown = (event: maplibregl.MapMouseEvent) => {
      if (presentationRef.current || event.originalEvent.button !== 0 || useMetroStore.getState().editorMode !== 'browse' || !map.getLayer('metro-station-labels')) return
      const id = map.queryRenderedFeatures(event.point, { layers: ['metro-station-labels'] })[0]?.properties?.id
      if (typeof id !== 'string') return
      if (lockedNodeIds(useMetroStore.getState().project, 'station').has(id)) {
        event.preventDefault()
        ignoreLabelClick = true
        useMetroStore.getState().selectStation(id)
        useMetroStore.getState().setNotice('这个站点已锁定，点击地图上的“解锁并拖动”后即可移动或合并。')
        return
      }
      event.preventDefault()
      labelDrag = { id, start: event.point, moved: false }
      map.dragPan.disable()
    }
    const onLabelMove = (event: maplibregl.MapMouseEvent) => {
      if (!labelDrag) return
      if (event.point.dist(labelDrag.start) > 4) labelDrag.moved = true
      if (!labelDrag.moved) return
      markerRecords.get(labelDrag.id)?.marker.setLngLat(event.lngLat)
      previewMerge(map, markerRecords, labelDrag.id, event.point)
    }
    const onLabelUp = (event: maplibregl.MapMouseEvent) => {
      if (!labelDrag) return
      const { id, moved } = labelDrag
      labelDrag = null
      ignoreLabelClick = true
      map.dragPan.enable()
      if (moved) finishStationDrag(map, markerRecords, id, event.point, event.lngLat)
      else useMetroStore.getState().selectStation(id)
    }
    const cancelLabelDrag = (event: maplibregl.MapMouseEvent) => {
      if (event.originalEvent.relatedTarget instanceof Node && container.contains(event.originalEvent.relatedTarget)) return
      if (!labelDrag) return
      const station = useMetroStore.getState().project.stations[labelDrag.id]
      if (station) markerRecords.get(station.id)?.marker.setLngLat([station.lng, station.lat])
      labelDrag = null
      map.dragPan.enable()
      for (const record of markerRecords.values()) record.element.classList.remove('map-station--merge-target')
      map.getCanvas().title = ''
    }
    const onMapMoveEnd = () => {
      refreshNetworks()
      const center = map.getCenter()
      try {
        localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ center: [center.lng, center.lat], zoom: map.getZoom() }))
      } catch {
        // Project storage errors are handled separately; losing map position is harmless.
      }
    }
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)
    const onBasemapError=()=>{
      if(map.getStyle()?.layers?.length)return
      setBasemapUnavailable(true)
      map.setStyle({version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',sources:{},layers:[{id:'local-network-background',type:'background',paint:{'background-color':'#edf2f5'}}]},{diff:false})
    }
    map.on('error',onBasemapError)
    map.on('style.load', onLoad)
    map.on('click', onMapClick)
    map.on('mousedown', onLabelDown)
    map.on('mousemove', onLabelMove)
    map.on('mouseup', onLabelUp)
    map.on('mouseout', cancelLabelDrag)
    map.on('moveend', onMapMoveEnd)
    return () => {
      catalogController.abort();clearTimeout(loadTimer);loader.dispose();loaderRef.current=null
      resizeObserver.disconnect()
      map.off('error',onBasemapError)
      map.off('style.load', onLoad)
      map.off('click', onMapClick)
      map.off('mousedown', onLabelDown)
      map.off('mousemove', onLabelMove)
      map.off('mouseup', onLabelUp)
      map.off('mouseout', cancelLabelDrag)
      map.off('moveend', onMapMoveEnd)
      markerRecords.forEach(({ marker }) => marker.remove())
      markerRecords.clear()
      waypointMarkerRecords.forEach(({ marker }) => marker.remove())
      waypointMarkerRecords.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(()=>{presentationRef.current=presentationMode;if(presentationMode)useMetroStore.getState().setEditorMode('browse');const map=mapRef.current;if(map?.getLayer('metro-readonly-stations'))map.setLayoutProperty('metro-readonly-stations','visibility',presentationMode?'visible':'none')},[presentationMode])
  useEffect(()=>{reloadRef.current()},[autoNetworks,project.cityId,presentationMode,existingOnly])
  useEffect(()=>{
    const map=mapRef.current;if(!map)return
    syncJourneyLayers(map,journey)
    if(!journey)return
    const points=journey.journey.legs.flatMap(l=>l.coordinates)
    if(!points.length){const s=journey.project.stations[journey.journey.from];if(s)map.flyTo({center:[s.lng,s.lat],zoom:15});return}
    const bounds=new maplibregl.LngLatBounds(points[0],points[0]);for(const p of points)bounds.extend(p)
    map.fitBounds(bounds,{padding:{top:165,bottom:90,left:65,right:65},maxZoom:15,duration:700})
  },[journey])

  useEffect(() => {
    if (target?.bounds) mapRef.current?.fitBounds(target.bounds, { padding: 55, maxZoom: 12, duration: 1000 })
    else if (target) mapRef.current?.flyTo({ center: target.center, zoom: target.zoom, essential: true })
  }, [target])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('metro-lines') as GeoJSONSource | undefined
    const lines=lineFeatureCollection(project,presentationMode?null:selectedLineId)
    if(presentationMode&&existingOnly)lines.features=[]
    source?.setData(lines)
    const labels = map.getSource('metro-station-labels') as GeoJSONSource | undefined
    labels?.setData(stationLabelCollection(project, presentationMode&&existingOnly?'none':presentationMode ? 'all' : stationLabelMode, selectedLineId))
    if (map.getLayer('metro-station-labels')) map.setLayoutProperty('metro-station-labels', 'visibility', 'visible')
    syncBrowseLayers(map,resultRef.current,catalogRef.current,project)
  }, [project, selectedLineId, presentationMode, stationLabelMode,existingOnly])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if(presentationMode){for(const record of markersRef.current.values())record.marker.remove();markersRef.current.clear();for(const record of waypointMarkersRef.current.values())record.marker.remove();waypointMarkersRef.current.clear();return}
    syncStationMarkers(map, markersRef.current)
    syncWaypointMarkers(map, waypointMarkersRef.current)
  }, [project, selectedStationId, selectedStationIds, selectedWaypointId, editorMode,presentationMode])

  const onExits=useRef((exits:StationExit[])=>{exitsRef.current=exits;if(mapRef.current)syncExitLayers(mapRef.current,exits)}).current

  return (
    <main className={`map-area${presentationMode ? ' map-area--presentation' : editorMode !== 'browse' ? ' map-area--adding' : ''}`}>
      <div ref={containerRef} className="map-canvas" aria-label="地铁线路规划地图" />
      <div className="transit-browse-controls">
        {basemapUnavailable&&<span role="status">网络底图暂不可用，显示本地线网。<button onClick={()=>{setBasemapUnavailable(false);mapRef.current?.setStyle(MAP_STYLE_URL,{diff:false})}}>重试底图</button></span>}
        <label><input type="checkbox" checked={autoNetworks} onChange={(event)=>useViewStore.getState().setAutoNetworks(event.target.checked)}/>全国线网自动展示</label>
        {presentationMode&&<label><input type="checkbox" checked={existingOnly} onChange={(event)=>useViewStore.getState().setExistingOnly(event.target.checked)}/>仅看已建成线路</label>}
        <button type="button" onClick={()=>{const city=catalog.find((item)=>item.id===project.cityId);if(city){const target=cityMapTarget(city);mapRef.current?.fitBounds(target.bounds!,{padding:60,maxZoom:12})}}}>返回我的规划城市</button>
        {browseResult.loading.length>0&&<small role="status">载入 {browseResult.loading.length} 个城市…</small>}
        {(catalogError||Object.keys(browseResult.errors).length>0)&&<span role="status">{catalogError||'部分城市暂未载入'} <button type="button" onClick={()=>{if(catalogError)retryCatalogRef.current();else reloadRef.current()}}>重试线网</button></span>}
      </div>
      {browseStation&&<StationDetailDrawer key={`${browseStation.cityId}:${browseStation.id}`} station={browseStation} onClose={()=>useViewStore.getState().setStation(null)} onExits={onExits} onLocate={(exit)=>mapRef.current?.flyTo({center:[exit.lng,exit.lat],zoom:17})}/>}
      {!presentationMode && editorMode === 'browse' && selectedStationId && lockedNodeIds(project, 'station').has(selectedStationId) && <div className="map-unlock-station" role="status">
        <span>{project.stations[selectedStationId]?.name} · 已锁定</span>
        <button type="button" onClick={() => useMetroStore.getState().unlockStation(selectedStationId)}>解锁并拖动</button>
      </div>}
      <button type="button" className="map-presentation-toggle" aria-pressed={presentationMode} onClick={() => {
        const next = !presentationMode
        presentationRef.current = next
        if (next) useMetroStore.getState().setEditorMode('browse')
        setPresentationMode(next)
      }}>{presentationMode ? '返回编辑' : '展示模式'}</button>
      <details open className="map-line-legend" aria-label="线路名称与颜色"><summary>线路图例</summary><div className="map-line-legend-items">
        {!(presentationMode&&existingOnly)&&<strong className="map-legend-city">当前规划 · {catalog.find((city)=>city.id===project.cityId)?.name??project.name}</strong>}
        {(presentationMode&&existingOnly?[]:Object.values(project.lines)).filter((line) => !line.parentLineId && line.visible !== false).map((line) => <div key={line.id}>
          <span className="map-line-swatch" style={{ backgroundColor: line.color, height: lineStatus(line) === 'planned' ? 6 : 4 }} aria-hidden="true" />
          <span>{line.name} · {lineStatus(line) === 'construction' && line.existingSegments?.length ? '部分在建' : [...new Set(Object.values(project.lines).filter((part) => rootLine(project,part).id === line.id).map(lineStatus))].map((status) => statusNames[status]).join(' / ')}</span>
        </div>)}
        {Object.values(tramPreview(project).lines).filter(line=>!line.parentLineId&&!browseResult.projects[project.cityId??"_"]).map(line=><div key={line.id}><span className="map-line-swatch" style={{backgroundColor:line.color}}/><span>{line.name} · 电车补充</span></div>)}{Object.entries(browseResult.projects).map(([cityId,network])=><div key={cityId} style={{display:'contents'}}><strong className="map-legend-city">{catalog.find((city)=>city.id===cityId)?.name??cityId} · 现状快照</strong>{Object.values(network.lines).filter((line)=>!line.parentLineId).map((line)=><div key={`${cityId}:${line.id}`}><span className="map-line-swatch" style={{backgroundColor:line.color,height:4}} aria-hidden="true"/><span>{line.name}</span></div>)}</div>)}
      </div></details>
      <div className="map-hint" role="status">
        <span className={`mode-dot${editorMode !== 'browse' ? ' mode-dot--active' : ''}`} />
        {presentationMode ? '只读浏览 · 拖动地图漫游，点击站点查看出入口' : editorMode === 'select-stations' ? `多选站点 · 已选 ${selectedStationIds.length} 个 · 再点取消选择` : editorMode === 'add-station' ? '添加站点 · 点空白处新建，点已有站直接接入' : editorMode === 'add-waypoint' ? pendingInsertIndex === null ? '点击线路插入控制点 · 拖动控制点调整走向' : '点击地图放置两节点间的控制点' : '浏览模式 · 拖动站点或站名，放到另一站上合并（保留目标站）'}
      </div>
    </main>
  )
}
