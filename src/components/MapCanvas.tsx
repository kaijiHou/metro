import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map, Marker } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { INITIAL_CENTER, INITIAL_ZOOM, MAP_STYLE_URL } from '../config/map'
import { useMetroStore } from '../store/metroStore'
import { lineFeatureCollection, stationFeatureCollection } from '../utils/geojson'

maplibregl.setWorkerUrl(mapWorkerUrl)

function syncMarkers(map: Map, markers: { current: Marker[] }) {
  const { project, selectedStationId } = useMetroStore.getState()
  markers.current.forEach((marker) => marker.remove())
  markers.current = []
  for (const feature of stationFeatureCollection(project, selectedStationId).features) {
    const station = project.stations[feature.properties.id]
    const element = document.createElement('button')
    element.type = 'button'
    element.className = `map-station${feature.properties.transfer ? ' map-station--transfer' : ''}${feature.properties.selected ? ' map-station--selected' : ''}`
    element.title = `${station.name}${feature.properties.transfer ? ' · 换乘站' : ''}`
    element.setAttribute('aria-label', `选择站点 ${station.name}`)
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      useMetroStore.getState().selectStation(station.id)
    })
    const marker = new maplibregl.Marker({ element, draggable: true, anchor: 'center' })
      .setLngLat([station.lng, station.lat])
      .addTo(map)
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat()
      useMetroStore.getState().updateStation(station.id, { lng, lat })
    })
    markers.current.push(marker)
  }
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<Marker[]>([])
  const project = useMetroStore((state) => state.project)
  const selectedLineId = useMetroStore((state) => state.selectedLineId)
  const selectedStationId = useMetroStore((state) => state.selectedStationId)
  const editorMode = useMetroStore((state) => state.editorMode)

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return
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
      else state.selectStation(null)
    }
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)
    map.on('style.load', onLoad)
    map.on('click', onMapClick)
    return () => {
      resizeObserver.disconnect()
      map.off('style.load', onLoad)
      map.off('click', onMapClick)
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
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
    syncMarkers(map, markersRef)
  }, [project, selectedStationId])

  return (
    <main className={`map-area${editorMode === 'add-station' ? ' map-area--adding' : ''}`}>
      <div ref={containerRef} className="map-canvas" aria-label="地铁线路规划地图" />
      <div className="map-hint" role="status">
        <span className={`mode-dot${editorMode === 'add-station' ? ' mode-dot--active' : ''}`} />
        {editorMode === 'add-station' ? '点击地图添加站点 · 拖动站点调整位置' : '浏览模式 · 点击站点编辑，拖动站点调整位置'}
      </div>
    </main>
  )
}
