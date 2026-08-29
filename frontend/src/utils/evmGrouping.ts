import type { EVMMetric } from '../api/monthly'

export interface ProjectGroupInfo {
  id: number
  code: string
  description: string
}

export interface EVMAggregate {
  ev: number
  ac: number
  pv_cumulative: number
  cv: number
  sv: number
  cpi: number | null
  spi: number | null
}

export function aggregateEVMRows(rows: { ev: number; ac: number; pv_cumulative: number }[]): EVMAggregate {
  const ev = rows.reduce((sum, r) => sum + r.ev, 0)
  const ac = rows.reduce((sum, r) => sum + r.ac, 0)
  const pv_cumulative = rows.reduce((sum, r) => sum + r.pv_cumulative, 0)
  return {
    ev,
    ac,
    pv_cumulative,
    cv: ev - ac,
    sv: ev - pv_cumulative,
    cpi: ac ? ev / ac : null,
    spi: pv_cumulative ? ev / pv_cumulative : null,
  }
}

export interface EVMGroupRow {
  group: ProjectGroupInfo
  metrics: EVMMetric[]
  aggregate: EVMAggregate
}

/** Groups a set of EVMMetric rows (typically already filtered to one period) by CBS Project Group. */
export function groupMetricsByProjectGroup(
  metrics: EVMMetric[],
  caGroupMap: Map<number, ProjectGroupInfo>,
): EVMGroupRow[] {
  const byGroup = new Map<number, EVMGroupRow>()
  for (const m of metrics) {
    const group = caGroupMap.get(m.control_account)
    if (!group) continue
    let entry = byGroup.get(group.id)
    if (!entry) {
      entry = { group, metrics: [], aggregate: aggregateEVMRows([]) }
      byGroup.set(group.id, entry)
    }
    entry.metrics.push(m)
  }
  for (const entry of byGroup.values()) {
    entry.aggregate = aggregateEVMRows(entry.metrics)
    entry.metrics.sort((a, b) => a.ca_code.localeCompare(b.ca_code))
  }
  return Array.from(byGroup.values()).sort((a, b) => a.group.code.localeCompare(b.group.code))
}

export interface PeriodHistoryRow {
  period_label: string
  whole: EVMAggregate
}

/** Builds one row per period (sorted chronologically) with the whole-project aggregate. */
export function buildHistoricalMatrix(metrics: EVMMetric[]): PeriodHistoryRow[] {
  const byPeriod = new Map<string, EVMMetric[]>()
  for (const m of metrics) {
    const list = byPeriod.get(m.period_label)
    if (list) {
      list.push(m)
    } else {
      byPeriod.set(m.period_label, [m])
    }
  }

  return Array.from(byPeriod.keys())
    .sort()
    .map((label) => ({ period_label: label, whole: aggregateEVMRows(byPeriod.get(label)!) }))
}

/**
 * Standard "generic" EAC formula: assumes remaining work is performed at the current
 * cost efficiency (CPI). Falls back to assuming the planned rate (CPI = 1) when CPI is
 * unavailable (no actual cost posted yet).
 */
export function computeEAC(bac: number, ev: number, ac: number, cpi: number | null): number {
  if (cpi) return ac + (bac - ev) / cpi
  return ac + (bac - ev)
}
