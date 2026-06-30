import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getProject, type Project } from '../api/projects'
import {
  createControlAccount,
  downloadControlAccountTemplate,
  importControlAccounts,
  listControlAccounts,
  listProjectGroups,
  type CBSControlAccount,
  type CBSProjectGroup,
} from '../api/cbs'
import { ApiError } from '../api/client'
import { formatCurrency } from '../utils/format'
import ExcelImportExport from '../components/ExcelImportExport'
import CBSTabs from '../components/CBSTabs'

export default function ControlAccountPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [groups, setGroups] = useState<CBSProjectGroup[]>([])
  const [accounts, setAccounts] = useState<CBSControlAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [projectGroupId, setProjectGroupId] = useState<number | ''>('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    Promise.all([getProject(projectIdNum), listProjectGroups(projectIdNum), listControlAccounts(projectIdNum)])
      .then(([proj, grps, cas]) => {
        setProject(proj)
        setGroups(grps)
        setAccounts(cas)
        if (grps.length > 0 && projectGroupId === '') setProjectGroupId(grps[0].id)
      })
      .catch(() => setError('Could not load CBS data. Is the backend running?'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdNum])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (projectGroupId === '') {
      setFormError('Please select a CBS Project Group.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createControlAccount({ project_group: projectGroupId, code, description })
      setCode('')
      setDescription('')
      setShowForm(false)
      refresh()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create control account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <CBSTabs projectId={projectIdNum} project={project} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">CBS Control Account</h1>
          <p className="text-sm text-gray-500">
            Every Control Account is linked to a CBS Project Group and rolls up budget from its Work Packages.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={groups.length === 0}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          title={groups.length === 0 ? 'Create a CBS Project Group first' : undefined}
        >
          {showForm ? 'Cancel' : 'New Control Account'}
        </button>
      </div>

      <ExcelImportExport
        onDownloadTemplate={downloadControlAccountTemplate}
        onImport={(file) => importControlAccounts(projectIdNum, file)}
        onImported={refresh}
      />

      {groups.length === 0 && !loading && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          No CBS Project Groups yet. Create one on the "CBS Project Group" tab first — every Control
          Account must be linked to a Project Group code.
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CBS Project Group</label>
            <select
              value={projectGroupId}
              onChange={(e) => setProjectGroupId(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} - {g.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CBS CA Code</label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. Cost account 1"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. Earthworks"
            />
          </div>

          {formError && <div className="md:col-span-4 text-sm text-red-600">{formError}</div>}

          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Control Account'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">CBS PG</th>
              <th className="px-4 py-3 font-medium">CBS CA</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium text-right">Budget (BAC)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && accounts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  No Control Accounts yet. Create one to get started.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              accounts.map((ca) => (
                <tr key={ca.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{ca.project_group_code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{ca.code}</td>
                  <td className="px-4 py-3">{ca.description}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(ca.budget)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
