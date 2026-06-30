import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProject, type Project } from '../api/projects'
import {
  getHistogram,
  getProjectHistogram,
  listControlAccounts,
  recomputePMB,
  type CBSControlAccount,
} from '../api/cbs'
import { ApiError } from '../api/client'
import { formatCurrency } from '../utils/format'
import CBSTabs from '../components/CBSTabs'

interface PVRow {
  period: string
  pv: number
  pv_cumulative: number
}

const PROJECT_OPTION = 'project'
const CHART_WIDTH = 800
const CHART_HEIGHT = 320
const PADDING = { top: 20, right: 80, bottom: 60, left: 80 }

export default function HistogramPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [accounts, setAccounts] = useState<CBSControlAccount[]>([])
  const [selection, setSelection] = useState<string>(PROJECT_OPTION)
  const [data, setData] = useState<PVRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)

  function refresh() {
    setLoading(true)
    Promise.all([getProject(projectIdNum), listControlAccounts(projectIdNum)])
      .then(([proj, cas]) => {
        setProject(proj)
        setAccounts(cas)
      })
      .catch(() => setError('Could not load Histogram data. Is the backend running?'))
      .finally(() => setLoading(false))
  }

  function fetchData(sel: string) {
    setLoading(true)
    const request = sel === PROJECT_OPTION ? getProjectHistogram(projectIdNum) : getHistogram(Number(sel))
    return request
      .then(setData)
      .catch(() => setError('Could not load PV data.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdNum])

  useEffect(() => {
    fetchData(selection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  async function handleRecompute() {
    setRecomputing(true)
    setError(null)
    try {
      await recomputePMB(projectIdNum)
      await fetchData(selection)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to recompute PMB')
    } finally {
      setRecomputing(false)
    }
  }

  const selectedAccount = accounts.find((a) => String(a.id) === selection)

  return (
    <div>
      <CBSTabs projectId={projectIdNum} project={project} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Histogram</h1>
          <p className="text-sm text-gray-500">
            Performance Measurement Baseline: PV phasing per period and PV cumulative for the selected
            Control Account.
          </p>
        </div>
        <button
          onClick={handleRecompute}
          disabled={recomputing}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {recomputing ? 'Recomputing...' : 'Recompute PMB'}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {accounts.length === 0 && !loading && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          No CBS Control Accounts yet. Create one on the "CBS Control Account" tab first.
        </div>
      )}

      <div className="mb-6 max-w-sm">
        <label className="block text-sm font-medium text-gray-700 mb-1">View</label>
        <select
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <option value={PROJECT_OPTION}>Whole Project</option>
          {accounts.map((ca) => (
            <option key={ca.id} value={ca.id}>
              {ca.code} - {ca.description}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {loading && <div className="py-12 text-center text-gray-500">Loading...</div>}
        {!loading && data.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            No PV data yet for {selection === PROJECT_OPTION ? 'this project' : selectedAccount?.code ?? 'this Control Account'}.
            Make sure Work Packages have BL Start/End dates, then click "Recompute PMB".
          </div>
        )}
        {!loading && data.length > 0 && <PVChart data={data} />}
      </div>

      {!loading && data.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium text-right">PV</th>
                <th className="px-4 py-3 font-medium text-right">PV Cumulative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row) => (
                <tr key={row.period} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{formatPeriod(row.period)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(row.pv)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(row.pv_cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatPeriod(period: string) {
  const d = new Date(period + 'T00:00:00')
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
}

function PVChart({ data }: { data: PVRow[] }) {
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom

  const maxPV = Math.max(...data.map((d) => d.pv), 1)
  const maxCumulative = Math.max(...data.map((d) => d.pv_cumulative), 1)

  const barWidth = plotWidth / data.length
  const yScaleLeft = (v: number) => plotHeight - (v / maxPV) * plotHeight
  const yScaleRight = (v: number) => plotHeight - (v / maxCumulative) * plotHeight

  const linePoints = data
    .map((d, i) => {
      const x = PADDING.left + barWidth * i + barWidth / 2
      const y = PADDING.top + yScaleRight(d.pv_cumulative)
      return `${x},${y}`
    })
    .join(' ')

  const yTicks = 5
  const leftTicks = Array.from({ length: yTicks + 1 }, (_, i) => (maxPV / yTicks) * i)
  const rightTicks = Array.from({ length: yTicks + 1 }, (_, i) => (maxCumulative / yTicks) * i)

  return (
    <div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full">
        {/* Left Y axis (PV) gridlines + labels */}
        {leftTicks.map((tick) => {
          const y = PADDING.top + yScaleLeft(tick)
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text x={PADDING.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#6b7280">
                {formatCurrency(tick)}
              </text>
            </g>
          )
        })}

        {/* Right Y axis (PV Cumulative) labels */}
        {rightTicks.map((tick) => {
          const y = PADDING.top + yScaleRight(tick)
          return (
            <text
              key={tick}
              x={CHART_WIDTH - PADDING.right + 8}
              y={y}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={11}
              fill="#1d4ed8"
            >
              {formatCurrency(tick)}
            </text>
          )
        })}

        {/* PV bars */}
        {data.map((d, i) => {
          const x = PADDING.left + barWidth * i
          const y = PADDING.top + yScaleLeft(d.pv)
          const height = plotHeight - yScaleLeft(d.pv)
          return (
            <rect
              key={d.period}
              x={x + barWidth * 0.15}
              y={y}
              width={barWidth * 0.7}
              height={Math.max(height, 0)}
              fill="#93c5fd"
            />
          )
        })}

        {/* PV cumulative line */}
        <polyline points={linePoints} fill="none" stroke="#1d4ed8" strokeWidth={2} />
        {data.map((d, i) => {
          const x = PADDING.left + barWidth * i + barWidth / 2
          const y = PADDING.top + yScaleRight(d.pv_cumulative)
          return <circle key={d.period} cx={x} cy={y} r={3} fill="#1d4ed8" />
        })}

        {/* X axis labels */}
        {data.map((d, i) => {
          const x = PADDING.left + barWidth * i + barWidth / 2
          return (
            <text
              key={d.period}
              x={x}
              y={CHART_HEIGHT - PADDING.bottom + 20}
              textAnchor="end"
              fontSize={11}
              fill="#6b7280"
              transform={`rotate(-40 ${x} ${CHART_HEIGHT - PADDING.bottom + 20})`}
            >
              {formatPeriod(d.period)}
            </text>
          )
        })}

        {/* Axes */}
        <line
          x1={PADDING.left}
          x2={PADDING.left}
          y1={PADDING.top}
          y2={CHART_HEIGHT - PADDING.bottom}
          stroke="#9ca3af"
        />
        <line
          x1={PADDING.left}
          x2={CHART_WIDTH - PADDING.right}
          y1={CHART_HEIGHT - PADDING.bottom}
          y2={CHART_HEIGHT - PADDING.bottom}
          stroke="#9ca3af"
        />
        <line
          x1={CHART_WIDTH - PADDING.right}
          x2={CHART_WIDTH - PADDING.right}
          y1={PADDING.top}
          y2={CHART_HEIGHT - PADDING.bottom}
          stroke="#1d4ed8"
        />
      </svg>

      <div className="mt-2 flex gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-blue-300" /> PV (monthly)
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 bg-blue-700" /> PV Cumulative
        </div>
      </div>
    </div>
  )
}
