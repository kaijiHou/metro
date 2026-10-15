import type { MetroProject } from '../models/metro'
import { fetchCityProject, type TransitCity } from '../utils/transit'
import { viewportCities, type Viewport } from '../utils/viewportCities'

export type BrowseResult = { projects: Record<string,MetroProject>; loading: string[]; errors: Record<string,string> }

/** Bounded, non-persistent viewport cache; a generation owns only the visible result. */
export class BrowseNetworkLoader {
  private cache = new Map<string,MetroProject>()
  private pending = new Map<string,{controller:AbortController; promise:Promise<MetroProject>}>()
  private generation = 0
  private disposed = false
  constructor(private fetchProject = fetchCityProject, readonly capacity = 12, private concurrency = 4) {}

  async update(catalog: TransitCity[], view: Viewport, exclude: string | undefined, enabled: boolean, publish: (result:BrowseResult) => void) {
    const generation = ++this.generation
    const cities = enabled && view.zoom >= 7 ? viewportCities(catalog,view).filter((city) => city.id !== exclude) : []
    const wanted = new Set(cities.map((city) => city.id))
    for (const [id,request] of this.pending) if (!wanted.has(id)) { request.controller.abort(); this.pending.delete(id) }
    const result: BrowseResult = {projects:{},loading:cities.map((city) => city.id),errors:{}}
    const emit = () => { if (!this.disposed && generation === this.generation) publish({projects:{...result.projects},loading:[...result.loading],errors:{...result.errors}}) }
    for (const city of cities) {
      const cached = this.cache.get(city.id)
      if (cached) { this.cache.delete(city.id); this.cache.set(city.id,cached); result.projects[city.id] = cached; result.loading = result.loading.filter((id) => id !== city.id) }
    }
    emit()
    const queue = cities.filter((city) => !result.projects[city.id])
    const worker = async () => {
      while (queue.length && !this.disposed && generation === this.generation) {
        const city = queue.shift()!
        let request = this.pending.get(city.id)
        if (!request) {
          const controller = new AbortController()
          request = {controller,promise:this.fetchProject(city,controller.signal)}
          this.pending.set(city.id,request)
        }
        try {
          const project = await request.promise
          if (request.controller.signal.aborted || this.disposed) continue
          this.cache.delete(city.id); this.cache.set(city.id,project)
          while (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value!)
          result.projects[city.id] = project
        } catch (error) {
          if (!request.controller.signal.aborted) result.errors[city.id] = error instanceof Error ? error.message : '线网加载失败'
        } finally {
          if (this.pending.get(city.id) === request) this.pending.delete(city.id)
          result.loading = result.loading.filter((id) => id !== city.id)
          emit()
        }
      }
    }
    await Promise.all(Array.from({length:this.concurrency},worker))
  }
  dispose() { this.disposed = true; ++this.generation; for (const request of this.pending.values()) request.controller.abort(); this.pending.clear(); this.cache.clear() }
}
