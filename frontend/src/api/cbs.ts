import { apiFetch, downloadFile, uploadFile } from './client'

export interface ImportResult {
  created: number
  updated: number
  total: number
  errors?: string[]
}

export interface ImportPreview extends ImportResult {
  created_codes: string[]
  updated_codes: string[]
}

export interface BulkDeleteResult {
  deleted: number
}

export interface CBSProjectGroup {
  id: number
  project: number
  code: string
  description: string
  budget: number
  created_at: string
  updated_at: string
}

export interface CBSControlAccount {
  id: number
  project_group: number
  project_group_code: string
  project: number
  code: string
  description: string
  budget: number
  created_at: string
  updated_at: string
}

export interface CBSProjectGroupInput {
  project: number
  code: string
  description: string
}

export interface CBSControlAccountInput {
  project_group: number
  code: string
  description: string
}

export function listProjectGroups(projectId: number) {
  return apiFetch<CBSProjectGroup[]>(`/api/cbs/project-groups/?project=${projectId}`)
}

export function createProjectGroup(data: CBSProjectGroupInput) {
  return apiFetch<CBSProjectGroup>('/api/cbs/project-groups/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteProjectGroup(id: number) {
  return apiFetch<void>(`/api/cbs/project-groups/${id}/`, { method: 'DELETE' })
}

export function bulkDeleteProjectGroups(ids: number[]) {
  return apiFetch<BulkDeleteResult>('/api/cbs/project-groups/bulk-delete/', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

export function previewProjectGroupImport(projectId: number, file: File) {
  const formData = new FormData()
  formData.append('project', String(projectId))
  formData.append('file', file)
  return uploadFile<ImportPreview>('/api/cbs/project-groups/import/preview/', formData)
}

export function listControlAccounts(projectId: number) {
  return apiFetch<CBSControlAccount[]>(`/api/cbs/control-accounts/?project=${projectId}`)
}

export function createControlAccount(data: CBSControlAccountInput) {
  return apiFetch<CBSControlAccount>('/api/cbs/control-accounts/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteControlAccount(id: number) {
  return apiFetch<void>(`/api/cbs/control-accounts/${id}/`, { method: 'DELETE' })
}

export function bulkDeleteControlAccounts(ids: number[]) {
  return apiFetch<BulkDeleteResult>('/api/cbs/control-accounts/bulk-delete/', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

export function downloadProjectGroupTemplate() {
  return downloadFile('/api/cbs/project-groups/template/', 'CBS_Project_Group_template.xlsx')
}

export function importProjectGroups(projectId: number, file: File) {
  const formData = new FormData()
  formData.append('project', String(projectId))
  formData.append('file', file)
  return uploadFile<ImportResult>('/api/cbs/project-groups/import/', formData)
}

export interface WorkPackage {
  id: number
  control_account: number
  ca_code: string
  project_group_code: string
  project: number
  code: string
  name: string
  budget: number
  unit: string
  qty: number
  bl_start: string | null
  bl_end: string | null
  created_at: string
  updated_at: string
}

export interface WorkPackageInput {
  control_account: number
  code: string
  name: string
  budget: number
  unit: string
  qty: number
  bl_start: string | null
  bl_end: string | null
}

export function listWorkPackages(projectId: number) {
  return apiFetch<WorkPackage[]>(`/api/cbs/work-packages/?project=${projectId}`)
}

export function createWorkPackage(data: WorkPackageInput) {
  return apiFetch<WorkPackage>('/api/cbs/work-packages/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteWorkPackage(id: number) {
  return apiFetch<void>(`/api/cbs/work-packages/${id}/`, { method: 'DELETE' })
}

export function bulkDeleteWorkPackages(ids: number[]) {
  return apiFetch<BulkDeleteResult>('/api/cbs/work-packages/bulk-delete/', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

export function downloadWorkPackageTemplate() {
  return downloadFile('/api/cbs/work-packages/template/', 'Work_Packages_template.xlsx')
}

export function importWorkPackages(projectId: number, file: File) {
  const formData = new FormData()
  formData.append('project', String(projectId))
  formData.append('file', file)
  return uploadFile<ImportResult>('/api/cbs/work-packages/import/', formData)
}

export function previewWorkPackageImport(projectId: number, file: File) {
  const formData = new FormData()
  formData.append('project', String(projectId))
  formData.append('file', file)
  return uploadFile<ImportPreview>('/api/cbs/work-packages/import/preview/', formData)
}

export interface MonthlyPV {
  id: number
  control_account: number
  period: string
  pv: number
  pv_cumulative: number
}

export function recomputePMB(projectId: number) {
  return apiFetch<{ periods_created: number }>('/api/cbs/control-accounts/recompute-pmb/', {
    method: 'POST',
    body: JSON.stringify({ project: projectId }),
  })
}

export function getHistogram(controlAccountId: number) {
  return apiFetch<MonthlyPV[]>(`/api/cbs/control-accounts/${controlAccountId}/histogram/`)
}

export interface ProjectPV {
  period: string
  pv: number
  pv_cumulative: number
}

export function getProjectHistogram(projectId: number) {
  return apiFetch<ProjectPV[]>(`/api/cbs/control-accounts/project-histogram/?project=${projectId}`)
}

export function downloadControlAccountTemplate() {
  return downloadFile('/api/cbs/control-accounts/template/', 'CBS_Control_Account_template.xlsx')
}

export function importControlAccounts(projectId: number, file: File) {
  const formData = new FormData()
  formData.append('project', String(projectId))
  formData.append('file', file)
  return uploadFile<ImportResult>('/api/cbs/control-accounts/import/', formData)
}

export function previewControlAccountImport(projectId: number, file: File) {
  const formData = new FormData()
  formData.append('project', String(projectId))
  formData.append('file', file)
  return uploadFile<ImportPreview>('/api/cbs/control-accounts/import/preview/', formData)
}
