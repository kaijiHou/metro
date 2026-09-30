import { emptyProject, type MetroProject } from '../models/metro'
import { migrateProjectToCurrent } from './migrations'
import { validateProject } from './validation'

export const STORAGE_KEY = 'metro-planner.project'
export const LEGACY_STORAGE_KEY = 'metro-planner.project.v1'

export type ProjectStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): ProjectStorage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

export function readStoredProject(storage = browserStorage()): { project: MetroProject; warning: string | null } {
  if (!storage) return { project: emptyProject(), warning: null }
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      const project = validateProject(migrateProjectToCurrent(parsed))
      if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && parsed.version === 1) {
        saveProject(project, storage)
      }
      return { project, warning: null }
    }
    const legacy = storage.getItem(LEGACY_STORAGE_KEY)
    if (legacy === null) return { project: emptyProject(), warning: null }
    const project = validateProject(migrateProjectToCurrent(JSON.parse(legacy)))
    saveProject(project, storage)
    try {
      storage.removeItem(LEGACY_STORAGE_KEY)
      return { project, warning: null }
    } catch (error) {
      console.warn('无法清理旧版浏览器数据', error)
      return { project, warning: '项目已升级并保存，但旧版浏览器数据清理失败。' }
    }
  } catch (error) {
    console.warn('无法恢复本地项目', error)
    return { project: emptyProject(), warning: '本地项目升级或读取失败，已打开空项目。原数据未删除；请先检查浏览器存储或导出备份。' }
  }
}

export function saveProject(project: MetroProject, storage = browserStorage()): void {
  if (!storage) return
  storage.setItem(STORAGE_KEY, JSON.stringify(project))
}

export function parseProjectJson(text: string): MetroProject {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSON 格式错误，请检查文件内容。')
  }
  return validateProject(migrateProjectToCurrent(value))
}

export function downloadProject(project: MetroProject): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${project.name.replace(/[\\/:*?"<>|]/g, '_') || 'metro-project'}.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
