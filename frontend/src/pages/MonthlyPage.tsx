import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getProject, type Project } from '../api/projects'
import {
  createPeriod,
  deletePeriod,
  downloadPeriodProgressTemplate,
  getProjectEVMHistogram,
  importPeriodProgress,
  listEVMMetrics,
  listPeriodProgress,
  listPeriods,
  previewPeriodProgressImport,
  type EVMMetric,
  type Period,
  type PeriodProgress,
  type ProjectEVMHistogramPoint,
} from '../api/monthly'
import { ApiError } from '../api/client'
import { formatCurrency } from '../utils/format'
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
  const [progress, setProgress] = useState<PeriodProgress[]>([])
  const [evmMetrics, setEvmMetrics] = useState<EVMMetric[]>([])
  const [evmLoading, setEvmLoading] = useState(false)
  const [evmHistogram, setEvmHistogram] = useState<ProjectEVMHistogramPoint[]>([])

  const [loading, setLoading] = useState(true)
  const [progressLoading, setProgressLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  function refresh() {
    setLoading(true)
    Promise.all([getProject(projectIdNum), listPeriods(projectIdNum)])
      .then(([proj, periodList]) => {
        setProject(proj)
        setPeriods(periodList)
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
      setProgress([])
      setEvmMetrics([])
      return
    }
    setProgressLoading(true)
    listPeriodProgress(periodId)
      .then(setProgress)
      .catch(() => setError('Could not load period progress.'))
      .finally(() => setProgressLoading(false))

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
    setProgressLoading(true)
    listPeriodProgress(periodId)
      .then(setProgress)
      .catch(() => setError('Could not load period progress.'))
      .finally(() => setProgressLoading(false))

    setEvmLoading(true)
    listEVMMetrics(periodId)
      .then(setEvmMetrics)
      .catch(() => setError('Could not load EVM metrics.'))
      .finally(() => setEvmLoading(false))

    refreshHistogram()
  }

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

      {evmHistogram.length > 0 && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">PV vs EV vs AC per Period</h2>
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

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="bg-gray-100 text-left text-gray-600">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">CBS CA</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">CBS WP</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Activity</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right">Budget</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right">Budget Qty</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Unit</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">BL Start</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">BL End</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Actual Start</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Actual Finish</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right">Actual Qty</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right">AC</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right">ETC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {progressLoading && (
                  <tr>
                    <td colSpan={13} className="px-4 py-6 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                )}
                {!progressLoading && progress.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-6 text-center text-gray-500">
                      No progress entries for this period yet. Upload an excel file to get started.
                    </td>
                  </tr>
                )}
                {!progressLoading &&
                  progress.map((row) => (
                    <tr key={row.id} className={row.is_cost_activity ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">{row.ca_code}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{row.wp_code}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.activity}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.budget)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{row.budget_qty}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.unit}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.bl_start ?? ''}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.bl_end ?? ''}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.start ?? ''}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.finish ?? ''}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{row.actual_qty}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.ac)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.etc)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 mb-3">
            <h2 className="text-lg font-semibold">EVM Results</h2>
            <p className="text-sm text-gray-500">CV = EV - AC, SV = EV - PV (cumulative), CPI = EV / AC, SPI = EV / PV (cumulative)</p>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">CBS CA</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">EV</th>
                  <th className="px-4 py-3 font-medium text-right">AC</th>
                  <th className="px-4 py-3 font-medium text-right">PV (Cum.)</th>
                  <th className="px-4 py-3 font-medium text-right">CV</th>
                  <th className="px-4 py-3 font-medium text-right">SV</th>
                  <th className="px-4 py-3 font-medium text-right">CPI</th>
                  <th className="px-4 py-3 font-medium text-right">SPI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {evmLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                )}
                {!evmLoading && evmMetrics.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                      No EVM results yet. Upload progress for this period to compute them.
                    </td>
                  </tr>
                )}
                {!evmLoading &&
                  evmMetrics.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.ca_code}</td>
                      <td className="px-4 py-3">{row.ca_description}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.ev)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.ac)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.pv_cumulative)}</td>
                      <td className={`px-4 py-3 text-right ${row.cv < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {formatCurrency(row.cv)}
                      </td>
                      <td className={`px-4 py-3 text-right ${row.sv < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {formatCurrency(row.sv)}
                      </td>
                      <td className={`px-4 py-3 text-right ${row.cpi !== null && row.cpi < 1 ? 'text-red-600' : 'text-green-700'}`}>
                        {row.cpi !== null ? row.cpi.toFixed(2) : '-'}
                      </td>
                      <td className={`px-4 py-3 text-right ${row.spi !== null && row.spi < 1 ? 'text-red-600' : 'text-green-700'}`}>
                        {row.spi !== null ? row.spi.toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
