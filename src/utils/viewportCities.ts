import type { TransitCity } from './transit'

export type Viewport = { west: number; south: number; east: number; north: number; zoom: number }

export function viewportCities(cities: TransitCity[], view: Viewport): TransitCity[] {
  const longitudeIntersects = (west: number, east: number) => {
    // Any repeated world copy can intersect an unwrapped MapLibre viewport.
    const viewEast = view.east < view.west ? view.east + 360 : view.east
    return Math.ceil((view.west - east) / 360) <= Math.floor((viewEast - west) / 360)
  }
  return cities.filter(({bounds}) => bounds[0][1] <= view.north && bounds[1][1] >= view.south && longitudeIntersects(bounds[0][0],bounds[1][0]))
    .sort((a,b) => Math.hypot(a.center[0]-(view.west+view.east)/2,a.center[1]-(view.south+view.north)/2)-Math.hypot(b.center[0]-(view.west+view.east)/2,b.center[1]-(view.south+view.north)/2))
}
