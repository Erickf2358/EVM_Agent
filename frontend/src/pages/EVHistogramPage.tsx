import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getProject, type Project } from '../api/projects'
import { listControlAccounts, type CBSControlAccount } from '../api/cbs'
import { getProjectEVMHistogram, type ProjectEVMHistogramPoint } from '../api/monthly'
import { formatCurrency } from '../utils/format'
import Breadcrumbs from '../components/Breadcrumbs'

const PROJECT_OPTION = 'project'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface HistogramRow extends ProjectEVMHistogramPoint {
  periodLabel: string
  pv_cumulative: number
  ev_cumulative: number
  ac_cumulative: number
}

function formatPeriod(period: string) {
  const [year, month] = period.split('-').map(Number)
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`
}

function withCumulative(rows: ProjectEVMHistogramPoint[]): HistogramRow[] {
  let pvCum = 0
  let evCum = 0
  let acCum = 0
  return rows.map((row) => {
    pvCum += row.pv
    evCum += row.ev
    acCum += row.ac
    return {
      ...row,
      periodLabel: formatPeriod(row.period),
      pv_cumulative: pvCum,
      ev_cumulative: evCum,
      ac_cumulative: acCum,
    }
  })
}

export default function EVHistogramPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [accounts, setAccounts] = useState<CBSControlAccount[]>([])
  const [selection, setSelection] = useState<string>(PROJECT_OPTION)
  const [data, setData] = useState<HistogramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    Promise.all([getProject(projectIdNum), listControlAccounts(projectIdNum)])
      .then(([proj, cas]) => {
        setProject(proj)
        setAccounts(cas)
      })
      .catch(() => setError('Could not load EVM Histogram data. Is the backend running?'))
      .finally(() => setLoading(false))
  }

  function fetchData(sel: string) {
    setLoading(true)
    const accountId = sel === PROJECT_OPTION ? undefined : Number(sel)
    getProjectEVMHistogram(projectIdNum, accountId)
      .then((rows) => setData(withCumulative(rows)))
      .catch(() => setError('Could not load PV/EV/AC data. Is the backend running?'))
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

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, row) => ({ pv: acc.pv + row.pv, ev: acc.ev + row.ev, ac: acc.ac + row.ac }),
        { pv: 0, ev: 0, ac: 0 },
      ),
    [data],
  )

  const selectedAccount = accounts.find((a) => String(a.id) === selection)

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Projects', to: '/projects' },
          { label: project ? `${project.code} - ${project.name}` : 'Project', to: `/projects/${projectIdNum}` },
          { label: 'Monthly Updates', to: `/projects/${projectIdNum}/monthly` },
          { label: 'EVM Histogram' },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold">EVM Histogram</h1>
        <p className="text-sm text-gray-500">
          PV (planned), EV (earned) and AC (actual) per period for the whole project or for a single
          Control Account. Cumulative values are running totals of the monthly amounts.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
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

      {!loading && data.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total PV (planned)" value={totals.pv} color="text-blue-700" />
          <StatCard label="Total EV (earned)" value={totals.ev} color="text-green-700" />
          <StatCard label="Total AC (actual)" value={totals.ac} color="text-red-600" />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {loading && <div className="py-12 text-center text-gray-500">Loading...</div>}
        {!loading && data.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            No PV/EV/AC data yet for{' '}
            {selection === PROJECT_OPTION ? 'this project' : selectedAccount?.code ?? 'this Control Account'}.
            Make sure the PMB has been recomputed and monthly progress has been uploaded.
          </div>
        )}
        {!loading && data.length > 0 && (
          <>
            <h2 className="mb-1 text-lg font-semibold">PV vs EV vs AC per Period</h2>
            <p className="mb-4 text-sm text-gray-500">Monthly amounts for the selected scope.</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodLabel" minTickGap={20} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} width={100} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="pv" name="PV" fill="#2563eb" />
                <Bar dataKey="ev" name="EV" fill="#16a34a" />
                <Bar dataKey="ac" name="AC" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>

            <h2 className="mb-1 mt-8 text-lg font-semibold">Cumulative PV / EV / AC</h2>
            <p className="mb-4 text-sm text-gray-500">Running totals of the monthly amounts (S-curve).</p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodLabel" minTickGap={20} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} width={100} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="pv_cumulative" name="PV (Cum.)" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="ev_cumulative" name="EV (Cum.)" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="ac_cumulative" name="AC (Cum.)" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {!loading && data.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-100 text-left text-gray-600">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Period</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">PV</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">EV</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">AC</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">PV (Cum.)</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">EV (Cum.)</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">AC (Cum.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row) => (
                <tr key={row.period} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{row.periodLabel}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.pv)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.ev)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.ac)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.pv_cumulative)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.ev_cumulative)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.ac_cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{formatCurrency(value)}</div>
    </div>
  )
}
