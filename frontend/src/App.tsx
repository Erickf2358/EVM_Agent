import { Routes, Route, Link } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ControlAccountPage from './pages/ControlAccountPage'
import WorkPackagePage from './pages/WorkPackagePage'
import HistogramPage from './pages/HistogramPage'
import MonthlyPage from './pages/MonthlyPage'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-blue-700 text-white shadow">
        <div className="mx-auto max-w-screen-2xl px-4 py-3 flex items-center gap-6">
          <Link to="/" className="font-semibold text-lg">
            PCE EVM
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className="hover:underline">Home</Link>
            <Link to="/projects" className="hover:underline">Projects</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/control-accounts" element={<ControlAccountPage />} />
          <Route path="/projects/:projectId/work-packages" element={<WorkPackagePage />} />
          <Route path="/projects/:projectId/histogram" element={<HistogramPage />} />
          <Route path="/projects/:projectId/monthly" element={<MonthlyPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
