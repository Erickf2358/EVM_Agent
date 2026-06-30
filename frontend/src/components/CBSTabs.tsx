import { Link, useLocation } from 'react-router-dom'
import Breadcrumbs from './Breadcrumbs'
import type { Project } from '../api/projects'

export default function CBSTabs({ projectId, project }: { projectId: number; project: Project | null }) {
  const { pathname } = useLocation()
  const isCA = pathname.endsWith('/control-accounts')
  const isWP = pathname.endsWith('/work-packages')
  const isHistogram = pathname.endsWith('/histogram')

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 ${
      active ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="mb-6">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Projects', to: '/projects' },
          { label: project ? `${project.code} - ${project.name}` : 'Project' },
          { label: 'CBS' },
        ]}
      />
      <div className="border-b border-gray-200 flex gap-2">
        <Link to={`/projects/${projectId}`} className={tabClass(!isCA && !isWP && !isHistogram)}>
          CBS Project Group
        </Link>
        <Link to={`/projects/${projectId}/control-accounts`} className={tabClass(isCA)}>
          CBS Control Account
        </Link>
        <Link to={`/projects/${projectId}/work-packages`} className={tabClass(isWP)}>
          Work Packages
        </Link>
        <Link to={`/projects/${projectId}/histogram`} className={tabClass(isHistogram)}>
          Histogram
        </Link>
      </div>
    </div>
  )
}
