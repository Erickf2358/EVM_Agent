import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getProject, type Project } from '../api/projects'
import { listControlAccounts, listProjectGroups, type CBSControlAccount, type CBSProjectGroup } from '../api/cbs'
import {
  createPeriod,
  deletePeriod,
  downloadPeriodProgressTemplate,
  getProjectEVMHistogram,
  importPeriodProgress,
  listEVMMetrics,
  listEVMMetricsForProject,
  listPeriods,
  previewPeriodProgressImport,
  type EVMMetric,
  type Period,
  type ProjectEVMHistogramPoint,
} from '../api/monthly'
import { ApiError } from '../api/client'
import { formatCurrency } from '../utils/format'
import { buildHistoricalMatrix, computeEAC, groupMetricsByProjectGroup, type ProjectGroupInfo } from '../utils/evmGrouping'
import Breadcrumbs from '../components/Breadcrumbs'
import ExcelImportExport from '../components/ExcelImportExport'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function MonthlyPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [periods, setPeriods] = useState<Period[]>([])
  const [periodId, setPeriodId] = useState<number | ''>('')
  const [evmMetrics, setEvmMetrics] = useState<EVMMetric[]>([])
  const [evmLoading, setEvmLoading] = useState(false)

  const [controlAccounts, setControlAccounts] = useState<CBSControlAccount[]>([])
  const [projectGroups, setProjectGroups] = useState<CBSProjectGroup[]>([])
  const [allEvmMetrics, setAllEvmMetrics] = useState<EVMMetric[]>([])
  const [evmHistogram, setEvmHistogram] = useState<ProjectEVMHistogramPoint[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const caGroupMap = useMemo(() => {
    const descByCode = new Map(projectGroups.map((g) => [g.code, g.description]))
    const map = new Map<number, ProjectGroupInfo>()
    for (const ca of controlAccounts) {
      map.set(ca.id, {
        id: ca.project_group,
        code: ca.project_group_code,
        description: descByCode.get(ca.project_group_code) ?? '',
      })
    }
    return map
  }, [controlAccounts, projectGroups])

  const groupBudgetById = useMemo(
    () => new Map(projectGroups.map((g) => [g.id, g.budget])),
    [projectGroups],
  )

  const caBudgetById = useMemo(
    () => new Map(controlAccounts.map((ca) => [ca.id, ca.budget])),
    [controlAccounts],
  )

  const periodGroupRows = useMemo(
    () => groupMetricsByProjectGroup(evmMetrics, caGroupMap),
    [evmMetrics, caGroupMap],
  )

  const historicalMatrix = useMemo(() => buildHistoricalMatrix(allEvmMetrics), [allEvmMetrics])

  function refresh() {
    setLoading(true)
    Promise.all([
      getProject(projectIdNum),
      listPeriods(projectIdNum),
      listControlAccounts(projectIdNum),
      listProjectGroups(projectIdNum),
      listEVMMetricsForProject(projectIdNum),
    ])
      .then(([proj, periodList, cas, groups, metrics]) => {
        setProject(proj)
        setPeriods(periodList)
        setControlAccounts(cas)
        setProjectGroups(groups)
        setAllEvmMetrics(metrics)
        setPeriodId((prev) => {
          if (prev !== '' && periodList.some((p) => p.id === prev)) return prev
          return periodList.length > 0 ? periodList[periodList.length - 1].id : ''
        })
      })
      .catch(() => setError('Could not load Monthly Update data. Is the backend running?'))
      .finally(() => setLoading(false))
  }

  function refreshHistogram() {
    getProjectEVMHistogram(projectIdNum)
      .then(setEvmHistogram)
      .catch(() => setError('Could not load PV/EV/AC histogram.'))
  }

  useEffect(() => {
    refresh()
    refreshHistogram()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdNum])

  useEffect(() => {
    if (periodId === '') {
      setEvmMetrics([])
      return
    }
    setEvmLoading(true)
    listEVMMetrics(periodId)
      .then(setEvmMetrics)
      .catch(() => setError('Could not load EVM metrics.'))
      .finally(() => setEvmLoading(false))
  }, [periodId])

  async function handleCreatePeriod(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const created = await createPeriod({ project: projectIdNum, year, month })
      setShowForm(false)
      refresh()
      setPeriodId(created.id)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create period')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePeriod(period: Period) {
    if (!window.confirm(`Delete period ${period.label}? This will remove all its progress entries.`)) return
    setDeletingId(period.id)
    try {
      await deletePeriod(period.id)
      if (periodId === period.id) setPeriodId('')
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete period')
    } finally {
      setDeletingId(null)
    }
  }

  function refreshProgress() {
    if (periodId === '') return
    setEvmLoading(true)
    listEVMMetrics(periodId)
      .then(setEvmMetrics)
      .catch(() => setError('Could not load EVM metrics.'))
      .finally(() => setEvmLoading(false))

    listEVMMetricsForProject(projectIdNum)
      .then(setAllEvmMetrics)
      .catch(() => setError('Could not load EVM history.'))

    refreshHistogram()
  }

  function toggleGroup(groupId: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const historyColSpan = 8

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Projects', to: '/projects' },
          { label: project ? `${project.code} - ${project.name}` : 'Project', to: `/projects/${projectIdNum}` },
          { label: 'Monthly Updates' },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Monthly Updates</h1>
        <p className="text-sm text-gray-500">
          Download the template (pre-filled with baseline CBS CA, CBS WP, Activity, Budget and BL dates from
          this project's Work Packages), fill in Actual Start, Actual Finish and Actual Qty per activity, then
          upload it for the selected period.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">Select a period...</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {MONTH_NAMES[p.month - 1]} {p.year}
              </option>
            ))}
          </select>
        </div>

        {periodId !== '' && (
          <button
            onClick={() => {
              const period = periods.find((p) => p.id === periodId)
              if (period) handleDeletePeriod(period)
            }}
            disabled={deletingId === periodId}
            className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deletingId === periodId ? 'Deleting...' : 'Delete Period'}
          </button>
        )}

        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          {showForm ? 'Cancel' : 'New Period'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreatePeriod}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <input
              required
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {formError && <div className="md:col-span-3 text-sm text-red-600">{formError}</div>}

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Period'}
            </button>
          </div>
        </form>
      )}

      {!loading && periods.length === 0 && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          No periods yet for this project. Click "New Period" to create one (e.g. the current month), then
          upload its progress.
        </div>
      )}

      {periodId !== '' && (
        <>
          <ExcelImportExport
            onDownloadTemplate={() => downloadPeriodProgressTemplate(projectIdNum)}
            onPreview={(file) => previewPeriodProgressImport(periodId, file)}
            onImport={(file) => importPeriodProgress(periodId, file)}
            onImported={refreshProgress}
          />

          <div className="mt-8 mb-3">
            <h2 className="text-lg font-semibold">EVM Results by Project Group</h2>
            <p className="text-sm text-gray-500">
              CV = EV - AC, SV = EV - PV (cumulative), CPI = EV / AC, SPI = EV / PV (cumulative). Click a group to
              see its Control Accounts.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Project Group</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">BAC</th>
                  <th className="px-4 py-3 font-medium text-right">EV</th>
                  <th className="px-4 py-3 font-medium text-right">AC</th>
                  <th className="px-4 py-3 font-medium text-right">PV (Cum.)</th>
                  <th className="px-4 py-3 font-medium text-right">CV</th>
                  <th className="px-4 py-3 font-medium text-right">SV</th>
                  <th className="px-4 py-3 font-medium text-right">CPI</th>
                  <th className="px-4 py-3 font-medium text-right">SPI</th>
                  <th className="px-4 py-3 font-medium text-right">EAC</th>
                  <th className="px-4 py-3 font-medium text-right">VAC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {evmLoading && (
                  <tr>
                    <td colSpan={12} className="px-4 py-6 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                )}
                {!evmLoading && periodGroupRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-6 text-center text-gray-500">
                      No EVM results yet. Upload progress for this period to compute them.
                    </td>
                  </tr>
                )}
                {!evmLoading &&
                  periodGroupRows.flatMap((groupRow) => {
                    const isOpen = expandedGroups.has(groupRow.group.id)
                    const bac = groupBudgetById.get(groupRow.group.id) ?? 0
                    const eac = computeEAC(bac, groupRow.aggregate.ev, groupRow.aggregate.ac, groupRow.aggregate.cpi)
                    const vac = bac - eac
                    const rows = [
                      <tr
                        key={`g-${groupRow.group.id}`}
                        onClick={() => toggleGroup(groupRow.group.id)}
                        className="cursor-pointer bg-gray-50/70 hover:bg-gray-100"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <span className="mr-2 inline-block w-3 text-gray-400">{isOpen ? '▾' : '▸'}</span>
                          {groupRow.group.code}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{groupRow.group.description}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(bac)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(groupRow.aggregate.ev)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(groupRow.aggregate.ac)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(groupRow.aggregate.pv_cumulative)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${groupRow.aggregate.cv < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {formatCurrency(groupRow.aggregate.cv)}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${groupRow.aggregate.sv < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {formatCurrency(groupRow.aggregate.sv)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            groupRow.aggregate.cpi !== null && groupRow.aggregate.cpi < 1 ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {groupRow.aggregate.cpi !== null ? groupRow.aggregate.cpi.toFixed(2) : '-'}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            groupRow.aggregate.spi !== null && groupRow.aggregate.spi < 1 ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {groupRow.aggregate.spi !== null ? groupRow.aggregate.spi.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(eac)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${vac < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {formatCurrency(vac)}
                        </td>
                      </tr>,
                    ]
                    if (isOpen) {
                      rows.push(
                        ...groupRow.metrics.map((row) => {
                          const caBac = caBudgetById.get(row.control_account) ?? 0
                          const caEac = computeEAC(caBac, row.ev, row.ac, row.cpi)
                          const caVac = caBac - caEac
                          return (
                            <tr key={row.id} className="text-gray-600 hover:bg-gray-50">
                              <td className="px-4 py-2 pl-10">{row.ca_code}</td>
                              <td className="px-4 py-2">{row.ca_description}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(caBac)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(row.ev)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(row.ac)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(row.pv_cumulative)}</td>
                              <td className={`px-4 py-2 text-right ${row.cv < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                {formatCurrency(row.cv)}
                              </td>
                              <td className={`px-4 py-2 text-right ${row.sv < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                {formatCurrency(row.sv)}
                              </td>
                              <td className={`px-4 py-2 text-right ${row.cpi !== null && row.cpi < 1 ? 'text-red-600' : 'text-green-700'}`}>
                                {row.cpi !== null ? row.cpi.toFixed(2) : '-'}
                              </td>
                              <td className={`px-4 py-2 text-right ${row.spi !== null && row.spi < 1 ? 'text-red-600' : 'text-green-700'}`}>
                                {row.spi !== null ? row.spi.toFixed(2) : '-'}
                              </td>
                              <td className="px-4 py-2 text-right">{formatCurrency(caEac)}</td>
                              <td className={`px-4 py-2 text-right ${caVac < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                {formatCurrency(caVac)}
                              </td>
                            </tr>
                          )
                        }),
                      )
                    }
                    return rows
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {evmHistogram.length > 0 && (
        <div className="mb-8 mt-10 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">PV vs EV vs AC per Period</h2>
          <p className="mb-3 text-sm text-gray-500">
            Covers the whole project duration (baseline PV is shown even for periods with no progress loaded yet).
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={evmHistogram} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(v) => formatCurrency(v)} width={100} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="pv" name="PV" fill="#2563eb" />
              <Bar dataKey="ev" name="EV" fill="#16a34a" />
              <Bar dataKey="ac" name="AC" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 mb-3">
        <h2 className="text-lg font-semibold">Historical EVM Indicators</h2>
        <p className="text-sm text-gray-500">
          Cumulative PV, EV, AC and cost/schedule indices for the whole project, for every period with progress loaded.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-100 text-left text-gray-600">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Period</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">PV (Cum.)</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">EV</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">AC</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">CV</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">SV</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">CPI</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">SPI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {historicalMatrix.length === 0 && (
              <tr>
                <td colSpan={historyColSpan} className="px-4 py-6 text-center text-gray-500">
                  No periods with EVM data yet.
                </td>
              </tr>
            )}
            {historicalMatrix.map((row) => (
              <tr key={row.period_label} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{row.period_label}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.whole.pv_cumulative)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.whole.ev)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.whole.ac)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right ${row.whole.cv < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {formatCurrency(row.whole.cv)}
                </td>
                <td className={`whitespace-nowrap px-3 py-3 text-right ${row.whole.sv < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {formatCurrency(row.whole.sv)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-3 text-right ${
                    row.whole.cpi !== null && row.whole.cpi < 1 ? 'text-red-600' : 'text-green-700'
                  }`}
                >
                  {row.whole.cpi !== null ? row.whole.cpi.toFixed(2) : '-'}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-3 text-right ${
                    row.whole.spi !== null && row.whole.spi < 1 ? 'text-red-600' : 'text-green-700'
                  }`}
                >
                  {row.whole.spi !== null ? row.whole.spi.toFixed(2) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
