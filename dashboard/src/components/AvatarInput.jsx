import { useState, useRef } from 'react'
import CropModal from './CropModal'

function initials(name) {
  if (!name) return '?'
  return name.split(/[\s._-]/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/**
 * Clickable circular avatar that opens a crop modal when a file is selected.
 * Props:
 *   photoUrl     — existing photo URL to show as the initial preview
 *   name         — name string used for initials fallback
 *   onBlobReady  — called with the cropped JPEG Blob when user finishes
 *   accentColor  — 'teal' | 'indigo'
 *   hint         — small hint text shown beside the avatar
 */
function AvatarInput({ photoUrl, name, onBlobReady, accentColor = 'teal', hint = 'Click to upload a photo (optional)' }) {
  const [preview, setPreview] = useState(photoUrl ?? null)
  const [cropSrc, setCropSrc] = useState(null)
  const fileRef = useRef(null)

  const ringClass = accentColor === 'indigo'
    ? 'ring-indigo-700 group-hover:ring-indigo-400'
    : 'ring-teal-700 group-hover:ring-teal-400'
  const bgClass   = accentColor === 'indigo' ? 'bg-indigo-900' : 'bg-teal-900'
  const txtClass  = accentColor === 'indigo' ? 'text-indigo-300' : 'text-teal-300'

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so re-picking the same file triggers onChange again
    if (!file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) return
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result)
    reader.readAsDataURL(file)
  }

  function handleCropApply(blob) {
    setCropSrc(null)
    setPreview(URL.createObjectURL(blob))
    onBlobReady(blob)
  }

  return (
    <>
      <div className="flex items-center gap-4 mb-5">

        {/* Clickable avatar circle */}
        <div className="relative group shrink-0">
          <div
            onClick={() => fileRef.current?.click()}
            className={`w-16 h-16 rounded-full overflow-hidden cursor-pointer ring-2 ${ringClass} transition-all`}
          >
            {preview ? (
              <img src={preview} alt="photo" className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full ${bgClass} flex items-center justify-center`}>
                <span className={`${txtClass} font-bold text-xl`}>{initials(name)}</span>
              </div>
            )}
          </div>

          {/* Camera icon overlay on hover */}
          <div
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* Hint text */}
        <div className="min-w-0">
          {name && <p className="text-gray-300 text-sm font-medium truncate">{name}</p>}
          <p className="text-gray-600 text-xs mt-0.5">{hint}</p>
        </div>
      </div>

      {/* Crop modal — renders over everything */}
      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          accentColor={accentColor}
          onCancel={() => setCropSrc(null)}
          onApply={handleCropApply}
        />
      )}
    </>
  )
}

export default AvatarInput
