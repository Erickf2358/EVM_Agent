import { apiFetch } from './client'

export type ProjectType = 'construction' | 'infrastructure' | 'engineering' | 'other'

export interface Project {
  id: number
  code: string
  name: string
  project_type: ProjectType
  budget: number
  created_at: string
  updated_at: string
}

export interface ProjectInput {
  code: string
  name: string
  project_type: ProjectType
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  construction: 'Construction',
  infrastructure: 'Infrastructure',
  engineering: 'Engineering',
  other: 'Other',
}

export function listProjects() {
  return apiFetch<Project[]>('/api/projects/')
}

export function getProject(id: number) {
  return apiFetch<Project>(`/api/projects/${id}/`)
}

export function createProject(data: ProjectInput) {
  return apiFetch<Project>('/api/projects/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteProject(id: number) {
  return apiFetch<void>(`/api/projects/${id}/`, {
    method: 'DELETE',
  })
}
