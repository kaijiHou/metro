import { emptyProject, type MetroProject } from '../models/metro'
import { validateProject } from './validation'

export const STORAGE_KEY = 'metro-planner.project.v1'

export function readStoredProject(): { project: MetroProject; warning: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { project: emptyProject(), warning: null }
    return { project: validateProject(JSON.parse(raw)), warning: null }
  } catch (error) {
    console.warn('无法恢复本地项目', error)
    return { project: emptyProject(), warning: '本地保存的数据无效，已打开空项目。原数据未覆盖，编辑后才会保存。' }
  }
}

export function saveProject(project: MetroProject): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
}

export function parseProjectJson(text: string): MetroProject {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSON 格式错误，请检查文件内容。')
  }
  return validateProject(value)
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
