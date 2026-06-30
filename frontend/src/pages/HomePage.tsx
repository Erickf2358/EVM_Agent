import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export default function HomePage() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking')

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => (res.ok ? setApiStatus('ok') : setApiStatus('error')))
      .catch(() => setApiStatus('error'))
  }, [])

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Welcome to PCE EVM</h1>
      <p className="text-gray-600 mb-8">Earned Value Management System</p>

      <div className="grid grid-cols-1 gap-6 mb-8">
        <Link
          to="/projects"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold mb-1">Projects</h2>
          <p className="text-gray-600">Performance Measurement Baseline and Monthly EVM</p>
        </Link>
      </div>

      <div className="text-sm text-gray-500">
        Backend API status:{' '}
        {apiStatus === 'checking' && <span>checking...</span>}
        {apiStatus === 'ok' && <span className="text-green-600 font-medium">connected</span>}
        {apiStatus === 'error' && <span className="text-red-600 font-medium">unreachable</span>}
      </div>
    </div>
  )
}
