import { useRef, useState } from 'react'
import { ApiError } from '../api/client'
import type { ImportResult } from '../api/cbs'

interface Props {
  onDownloadTemplate: () => Promise<void>
  onImport: (file: File) => Promise<ImportResult>
  onImported: () => void
}

export default function ExcelImportExport({ onDownloadTemplate, onImport, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setError(null)
    try {
      await onDownloadTemplate()
    } catch {
      setError('Could not download template.')
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await onImport(file)
      let msg = `Imported ${result.total} row(s): ${result.created} created, ${result.updated} updated.`
      if (result.errors?.length) {
        msg += ` ${result.errors.length} error(s): ${result.errors.join(' ')}`
      }
      setMessage(msg)
      onImported()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleDownload}
        className="rounded border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
      >
        Download excel template
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        className="rounded border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
      >
        {busy ? 'Uploading...' : 'Upload excel file'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
      {message && <span className="text-sm text-green-700">{message}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  )
}
