import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getProject, type Project } from '../api/projects'
import {
  createWorkPackage,
  deleteWorkPackage,
  downloadWorkPackageTemplate,
  importWorkPackages,
  listControlAccounts,
  listWorkPackages,
  type CBSControlAccount,
  type WorkPackage,
} from '../api/cbs'
import { ApiError } from '../api/client'
import { formatCurrency } from '../utils/format'
import CBSTabs from '../components/CBSTabs'
import ExcelImportExport from '../components/ExcelImportExport'

export default function WorkPackagePage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [accounts, setAccounts] = useState<CBSControlAccount[]>([])
  const [packages, setPackages] = useState<WorkPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [controlAccountId, setControlAccountId] = useState<number | ''>('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [unit, setUnit] = useState('')
  const [qty, setQty] = useState('')
  const [blStart, setBlStart] = useState('')
  const [blEnd, setBlEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  function refresh() {
    setLoading(true)
    Promise.all([getProject(projectIdNum), listControlAccounts(projectIdNum), listWorkPackages(projectIdNum)])
      .then(([proj, cas, wps]) => {
        setProject(proj)
        setAccounts(cas)
        setPackages(wps)
        if (cas.length > 0 && controlAccountId === '') setControlAccountId(cas[0].id)
      })
      .catch(() => setError('Could not load Work Package data. Is the backend running?'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdNum])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (controlAccountId === '') {
      setFormError('Please select a CBS Control Account.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createWorkPackage({
        control_account: controlAccountId,
        code,
        name,
        budget: Number(budget) || 0,
        unit,
        qty: Number(qty) || 0,
        bl_start: blStart || null,
        bl_end: blEnd || null,
      })
      setCode('')
      setName('')
      setBudget('')
      setUnit('')
      setQty('')
      setBlStart('')
      setBlEnd('')
      setShowForm(false)
      refresh()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create work package')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(wp: WorkPackage) {
    if (!window.confirm(`Delete Work Package "${wp.code} - ${wp.name}"? This cannot be undone.`)) return
    setDeletingId(wp.id)
    try {
      await deleteWorkPackage(wp.id)
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete work package')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <CBSTabs projectId={projectIdNum} project={project} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Work Packages</h1>
          <p className="text-sm text-gray-500">
            Every Work Package is linked to a CBS Control Account and contributes to its budget (BAC).
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={accounts.length === 0}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          title={accounts.length === 0 ? 'Create a CBS Control Account first' : undefined}
        >
          {showForm ? 'Cancel' : 'New Work Package'}
        </button>
      </div>

      <ExcelImportExport
        onDownloadTemplate={downloadWorkPackageTemplate}
        onImport={(file) => importWorkPackages(projectIdNum, file)}
        onImported={refresh}
      />

      {accounts.length === 0 && !loading && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          No CBS Control Accounts yet. Create one on the "CBS Control Account" tab first — every Work
          Package must be linked to a Control Account code.
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CBS Control Account</label>
            <select
              value={controlAccountId}
              onChange={(e) => setControlAccountId(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {accounts.map((ca) => (
                <option key={ca.id} value={ca.id}>
                  {ca.code} - {ca.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CBS WP Code</label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. WP-01"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">WP Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. Excavation"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Budget</label>
            <input
              required
              type="number"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. m3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
            <input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">BL Start</label>
            <input
              type="date"
              value={blStart}
              onChange={(e) => setBlStart(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">BL End</label>
            <input
              type="date"
              value={blEnd}
              onChange={(e) => setBlEnd(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {formError && <div className="md:col-span-4 text-sm text-red-600">{formError}</div>}

          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Work Package'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">CBS CA</th>
              <th className="px-4 py-3 font-medium">CBS WP</th>
              <th className="px-4 py-3 font-medium">WP Name</th>
              <th className="px-4 py-3 font-medium text-right">Budget</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium">BL Start</th>
              <th className="px-4 py-3 font-medium">BL End</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && packages.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                  No Work Packages yet. Create one to get started.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              packages.map((wp) => (
                <tr key={wp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{wp.ca_code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{wp.code}</td>
                  <td className="px-4 py-3">{wp.name}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(wp.budget)}</td>
                  <td className="px-4 py-3">{wp.unit}</td>
                  <td className="px-4 py-3 text-right">{wp.qty}</td>
                  <td className="px-4 py-3">{wp.bl_start ?? ''}</td>
                  <td className="px-4 py-3">{wp.bl_end ?? ''}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(wp)}
                      disabled={deletingId === wp.id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Delete work package"
                    >
                      {deletingId === wp.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
