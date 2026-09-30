import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { INITIAL_CENTER, INITIAL_ZOOM, MAP_STYLE_URL } from '../config/map'
import { useMetroStore } from '../store/metroStore'
import { lineFeatureCollection, stationFeatureCollection } from '../utils/geojson'

maplibregl.setWorkerUrl(mapWorkerUrl)

type MarkerRecord = {
  marker: Marker
  element: HTMLButtonElement
}

function markerClass(transfer: boolean, selected: boolean): string {
  return `map-station${transfer ? ' map-station--transfer' : ''}${selected ? ' map-station--selected' : ''}`
}

function syncStationMarkers(map: MapLibreMap, markers: Map<string, MarkerRecord>) {
  const { project, selectedStationId } = useMetroStore.getState()
  const currentIds = new Set<string>()
  for (const feature of stationFeatureCollection(project, selectedStationId).features) {
    const stationId = feature.properties.id
    const station = project.stations[stationId]
    currentIds.add(stationId)
    let record = markers.get(stationId)
    if (!record) {
      const element = document.createElement('button')
      element.type = 'button'
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        useMetroStore.getState().selectStation(stationId)
      })
      const marker = new maplibregl.Marker({ element, draggable: true, anchor: 'center' })
        .setLngLat([station.lng, station.lat])
        .addTo(map)
      marker.on('dragend', () => {
        const state = useMetroStore.getState()
        if (!state.project.stations[stationId]) return
        const { lng, lat } = marker.getLngLat()
        state.updateStation(stationId, { lng, lat })
      })
      record = { marker, element }
      markers.set(stationId, record)
    }

    const position = record.marker.getLngLat()
    if (position.lng !== station.lng || position.lat !== station.lat) {
      record.marker.setLngLat([station.lng, station.lat])
    }
    record.element.className = markerClass(feature.properties.transfer, feature.properties.selected)
    record.element.title = `${station.name}${feature.properties.transfer ? ' · 换乘站' : ''}`
    record.element.setAttribute('aria-label', `选择站点 ${station.name}`)
  }

  for (const [stationId, record] of markers) {
    if (currentIds.has(stationId)) continue
    record.marker.remove()
    markers.delete(stationId)
  }
}

function syncWaypointMarkers(map: MapLibreMap, markers: Map<string, MarkerRecord>) {
  const { project, selectedWaypointId } = useMetroStore.getState()
  for (const waypoint of Object.values(project.waypoints)) {
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
    record.element.title = '控制点 · 拖动调整线路'
    record.element.setAttribute('aria-label', '选择控制点')
  }
  for (const [id, record] of markers) {
    if (project.waypoints[id]) continue
    record.marker.remove()
    markers.delete(id)
  }
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Map<string, MarkerRecord>>(new Map())
  const waypointMarkersRef = useRef<Map<string, MarkerRecord>>(new Map())
  const project = useMetroStore((state) => state.project)
  const selectedLineId = useMetroStore((state) => state.selectedLineId)
  const selectedStationId = useMetroStore((state) => state.selectedStationId)
  const selectedWaypointId = useMetroStore((state) => state.selectedWaypointId)
  const editorMode = useMetroStore((state) => state.editorMode)

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return
    const markerRecords = markersRef.current
    const waypointMarkerRecords = waypointMarkersRef.current
    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE_URL,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    const onLoad = () => {
      map.addSource('metro-lines', { type: 'geojson', data: lineFeatureCollection(useMetroStore.getState().project, useMetroStore.getState().selectedLineId) })
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
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 6, 4], 'line-opacity': ['case', ['get', 'selected'], 1, 0.75] },
      })
    }
    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      const state = useMetroStore.getState()
      if (state.editorMode === 'add-station') state.createStation(event.lngLat.lng, event.lngLat.lat)
      else if (state.editorMode === 'add-waypoint' && state.selectedLineId) {
        state.createWaypoint(event.lngLat.lng, event.lngLat.lat, state.selectedLineId, state.pendingInsertIndex ?? undefined)
      } else {
        state.selectStation(null)
        state.selectWaypoint(null)
      }
    }
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)
    map.on('style.load', onLoad)
    map.on('click', onMapClick)
    return () => {
      resizeObserver.disconnect()
      map.off('style.load', onLoad)
      map.off('click', onMapClick)
      markerRecords.forEach(({ marker }) => marker.remove())
      markerRecords.clear()
      waypointMarkerRecords.forEach(({ marker }) => marker.remove())
      waypointMarkerRecords.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('metro-lines') as GeoJSONSource | undefined
    source?.setData(lineFeatureCollection(project, selectedLineId))
  }, [project, selectedLineId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    syncStationMarkers(map, markersRef.current)
    syncWaypointMarkers(map, waypointMarkersRef.current)
  }, [project, selectedStationId, selectedWaypointId])

  return (
    <main className={`map-area${editorMode !== 'browse' ? ' map-area--adding' : ''}`}>
      <div ref={containerRef} className="map-canvas" aria-label="地铁线路规划地图" />
      <div className="map-hint" role="status">
        <span className={`mode-dot${editorMode !== 'browse' ? ' mode-dot--active' : ''}`} />
        {editorMode === 'add-station' ? '点击地图添加站点 · 拖动站点调整位置' : editorMode === 'add-waypoint' ? '点击地图添加控制点 · 拖动控制点调整线路' : '浏览模式 · 点击节点编辑，拖动节点调整位置'}
      </div>
    </main>
  )
}
