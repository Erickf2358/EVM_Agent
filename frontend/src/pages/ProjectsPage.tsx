import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  createProject,
  deleteProject,
  listProjects,
  PROJECT_TYPE_LABELS,
  type Project,
  type ProjectType,
} from '../api/projects'
import { ApiError } from '../api/client'
import { formatCurrency } from '../utils/format'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('other')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  function refresh() {
    setLoading(true)
    listProjects()
      .then(setProjects)
      .catch(() => setError('Could not load projects. Is the backend running?'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await createProject({ code, name, project_type: projectType })
      setCode('')
      setName('')
      setProjectType('other')
      setShowForm(false)
      refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError('Failed to create project')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: Project) {
    if (!window.confirm(`Delete project "${p.code} - ${p.name}"? This cannot be undone.`)) {
      return
    }
    if (!window.confirm(`Are you absolutely sure? All CBS, work package, and progress data for "${p.code}" will be permanently deleted.`)) {
      return
    }
    setDeletingId(p.id)
    try {
      await deleteProject(p.id)
      refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to delete project')
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-gray-500">
            Budget is rolled up automatically from Work Packages once the CBS structure is defined.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          {showForm ? 'Cancel' : 'Create New Project'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. RO-01"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. RO Sample Project"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Type</label>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value as ProjectType)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <div className="md:col-span-3 text-sm text-red-600">{formError}</div>
          )}

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Project'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Project ID</th>
              <th className="px-4 py-3 font-medium">Project Name</th>
              <th className="px-4 py-3 font-medium">Project Type</th>
              <th className="px-4 py-3 font-medium text-right">Budget (BAC)</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && projects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No projects yet. Create one to get started.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              projects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.code}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">{PROJECT_TYPE_LABELS[p.project_type]}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(p.budget)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/projects/${p.id}`} className="text-blue-700 hover:underline">
                      Open CBS &rarr;
                    </Link>
                    <Link to={`/projects/${p.id}/monthly`} className="ml-4 text-blue-700 hover:underline">
                      Monthly Updates &rarr;
                    </Link>
                    <button
                      onClick={() => handleDelete(p)}
                      disabled={deletingId === p.id}
                      className="ml-4 text-red-600 hover:underline disabled:opacity-50"
                    >
                      {deletingId === p.id ? 'Deleting...' : 'Delete'}
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
