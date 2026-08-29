import { apiFetch, downloadFile, uploadFile } from './client'
import type { ImportPreview, ImportResult } from './cbs'

export interface Period {
  id: number
  project: number
  year: number
  month: number
  label: string
  created_at: string
  updated_at: string
}

export interface PeriodInput {
  project: number
  year: number
  month: number
}

export interface PeriodProgress {
  id: number
  period: number
  work_package: number
  ca_code: string
  wp_code: string
  activity: string
  budget: number
  budget_qty: number
  unit: string
  bl_start: string | null
  bl_end: string | null
  start: string | null
  finish: string | null
  actual_qty: number
  ev: number
  ac: number
  etc: number
  eac: number
  is_cost_activity: boolean
  created_at: string
  updated_at: string
}

export function listPeriods(projectId: number) {
  return apiFetch<Period[]>(`/api/monthly/periods/?project=${projectId}`)
}

export function createPeriod(data: PeriodInput) {
  return apiFetch<Period>('/api/monthly/periods/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deletePeriod(id: number) {
  return apiFetch<void>(`/api/monthly/periods/${id}/`, { method: 'DELETE' })
}

export function listPeriodProgress(periodId: number) {
  return apiFetch<PeriodProgress[]>(`/api/monthly/progress/?period=${periodId}`)
}

export function downloadPeriodProgressTemplate(projectId: number) {
  return downloadFile(`/api/monthly/progress/template/?project=${projectId}`, 'Period_Progress_template.xlsx')
}

export function importPeriodProgress(periodId: number, file: File) {
  const formData = new FormData()
  formData.append('period', String(periodId))
  formData.append('file', file)
  return uploadFile<ImportResult>('/api/monthly/progress/import/', formData)
}

export function previewPeriodProgressImport(periodId: number, file: File) {
  const formData = new FormData()
  formData.append('period', String(periodId))
  formData.append('file', file)
  return uploadFile<ImportPreview>('/api/monthly/progress/import/preview/', formData)
}

export interface EVMMetric {
  id: number
  control_account: number
  ca_code: string
  ca_description: string
  period: number
  period_label: string
  ev: number
  ac: number
  ev_monthly: number
  ac_monthly: number
  pv_cumulative: number
  cv: number
  sv: number
  cpi: number | null
  spi: number | null
}

export function listEVMMetrics(periodId: number) {
  return apiFetch<EVMMetric[]>(`/api/monthly/evm/?period=${periodId}`)
}

export function listEVMMetricsForProject(projectId: number) {
  return apiFetch<EVMMetric[]>(`/api/monthly/evm/?project=${projectId}`)
}

export interface ProjectEVMHistogramPoint {
  period: string
  pv: number
  ev: number
  ac: number
}

export function getProjectEVMHistogram(projectId: number) {
  return apiFetch<ProjectEVMHistogramPoint[]>(`/api/monthly/evm/project-histogram/?project=${projectId}`)
}
