import { useEffect, useState, type FormEvent } from 'react'
import { getProject, type Project } from '../api/projects'
import {
  createProjectGroup,
  downloadProjectGroupTemplate,
  importProjectGroups,
  listProjectGroups,
  type CBSProjectGroup,
} from '../api/cbs'
import { ApiError } from '../api/client'
import { formatCurrency } from '../utils/format'
import ExcelImportExport from '../components/ExcelImportExport'
import CBSTabs from '../components/CBSTabs'
import { useParams } from 'react-router-dom'

export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [groups, setGroups] = useState<CBSProjectGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    Promise.all([getProject(projectIdNum), listProjectGroups(projectIdNum)])
      .then(([proj, grps]) => {
        setProject(proj)
        setGroups(grps)
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
    setSaving(true)
    setFormError(null)
    try {
      await createProjectGroup({ project: projectIdNum, code, description })
      setCode('')
      setDescription('')
      setShowForm(false)
      refresh()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create project group')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <CBSTabs projectId={projectIdNum} project={project} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">CBS Project Group</h1>
          <p className="text-sm text-gray-500">
            Project Groups roll up budget from their Control Accounts.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          {showForm ? 'Cancel' : 'New Project Group'}
        </button>
      </div>

      <ExcelImportExport
        onDownloadTemplate={downloadProjectGroupTemplate}
        onImport={(file) => importProjectGroups(projectIdNum, file)}
        onImported={refresh}
      />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CBS PG Code</label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. PG-01"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. Civil Works"
            />
          </div>

          {formError && <div className="md:col-span-3 text-sm text-red-600">{formError}</div>}

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Project Group'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">CBS PG</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium text-right">Budget (BAC)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && groups.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  No CBS Project Groups yet. Create one to get started.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              groups.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{g.code}</td>
                  <td className="px-4 py-3">{g.description}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(g.budget)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
