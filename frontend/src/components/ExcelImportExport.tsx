import { useRef, useState } from 'react'
import { ApiError } from '../api/client'
import type { ImportPreview, ImportResult } from '../api/cbs'

interface Props {
  onDownloadTemplate: () => Promise<void>
  onPreview: (file: File) => Promise<ImportPreview>
  onImport: (file: File) => Promise<ImportResult>
  onImported: () => void
}

function summarizeCodes(codes: string[], max = 15) {
  if (codes.length === 0) return 'none'
  if (codes.length <= max) return codes.join(', ')
  return `${codes.slice(0, max).join(', ')}, +${codes.length - max} more`
}

export default function ExcelImportExport({ onDownloadTemplate, onPreview, onImport, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)

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
    setPreview(null)
    try {
      const result = await onPreview(file)
      setPendingFile(file)
      setPreview(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not preview file.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm() {
    if (!pendingFile) return
    setBusy(true)
    setError(null)
    try {
      const result = await onImport(pendingFile)
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
      setPreview(null)
      setPendingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleCancel() {
    setPreview(null)
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3">
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
          {busy && !preview ? 'Checking file...' : 'Upload excel file'}
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

      {preview && pendingFile && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="mb-2 font-medium text-gray-900">
            Preview for "{pendingFile.name}" — nothing has been saved yet.
          </p>
          <ul className="mb-3 space-y-1 text-gray-700">
            <li>
              <span className="font-medium text-green-700">{preview.created}</span> row(s) will be{' '}
              <span className="font-medium">created</span>: {summarizeCodes(preview.created_codes)}
            </li>
            <li>
              <span className="font-medium text-amber-700">{preview.updated}</span> row(s) will be{' '}
              <span className="font-medium">updated</span>: {summarizeCodes(preview.updated_codes)}
            </li>
            {preview.errors && preview.errors.length > 0 && (
              <li className="text-red-700">
                {preview.errors.length} row(s) with errors (will be skipped): {preview.errors.join(' ')}
              </li>
            )}
          </ul>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? 'Importing...' : 'Confirm import'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleCancel}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
