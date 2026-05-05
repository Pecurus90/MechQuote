import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Upload, FileText, Trash2, Image } from 'lucide-react'
import api from '@/lib/api'

interface UploadedFile {
  id: number
  file_type: string
  filename: string
  path: string
}

interface FileUploadProps {
  partId?: number
  files: UploadedFile[]
  onUploaded: () => void
}

export default function FileUpload({ partId, files, onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!partId) return
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      await api.post(`/parts/${partId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onUploaded()
    } catch (e) {
      console.error('Upload error', e)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (fileId: number) => {
    if (!confirm('Eliminare questo file?')) return
    try {
      await api.delete(`/files/${fileId}`)
      onUploaded()
    } catch (e) {
      console.error('Delete error', e)
    }
  }

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'dxf': return <FileText className="w-4 h-4 text-blue-600" />
      case 'step': return <FileText className="w-4 h-4 text-green-600" />
      case 'pdf': return <FileText className="w-4 h-4 text-red-600" />
      case 'image': return <Image className="w-4 h-4 text-purple-600" />
      default: return <FileText className="w-4 h-4 text-gray-600" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">File Allegati</CardTitle>
      </CardHeader>
      <CardContent>
        <input
          ref={inputRef}
          type="file"
          accept=".dxf,.step,.stp,.pdf,.png,.jpg,.jpeg"
          onChange={handleUpload}
          className="hidden"
        />
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={!partId || uploading}
          className="mb-4"
        >
          <Upload className="w-4 h-4 mr-1" />
          {uploading ? 'Caricamento...' : 'Carica File'}
        </Button>

        {files.length === 0 ? (
          <p className="text-sm text-gray-500">Nessun file caricato.</p>
        ) : (
          <div className="space-y-2">
            {files.map(f => (
              <div key={f.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center gap-2">
                  {getFileIcon(f.file_type)}
                  <span className="text-sm">{f.filename}</span>
                </div>
                <button onClick={() => handleDelete(f.id)} className="p-1 hover:bg-red-50 rounded">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
