import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { useLanguage } from '../lib/i18n'

/** Takes an image data URL + pixelCrop rect and returns a cropped JPEG Blob */
export async function getCroppedBlob(imageSrc, pixelCrop) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })
  const canvas = document.createElement('canvas')
  const size = Math.min(pixelCrop.width, pixelCrop.height)
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, size, size
  )
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

/**
 * Full-screen crop modal using react-easy-crop.
 * Props:
 *   imageSrc    — data URL of the image to crop
 *   onCancel    — called when user cancels
 *   onApply     — called with the cropped Blob
 *   accentColor — 'indigo' | 'teal'  (controls crop border + Apply button colour)
 */
function CropModal({ imageSrc, onCancel, onApply, accentColor = 'indigo' }) {
  const { T } = useLanguage()
  const S = T.settings

  const [crop,        setCrop]        = useState({ x: 0, y: 0 })
  const [zoom,        setZoom]        = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [applying,    setApplying]    = useState(false)

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedArea(pixels)
  }, [])

  async function handleApply() {
    if (!croppedArea) return
    setApplying(true)
    const blob = await getCroppedBlob(imageSrc, croppedArea)
    setApplying(false)
    onApply(blob)
  }

  const btnClass    = accentColor === 'teal' ? 'bg-teal-600 hover:bg-teal-500' : 'bg-indigo-600 hover:bg-indigo-500'
  const borderColor = accentColor === 'teal' ? '#14b8a6' : '#6366f1'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h3 className="text-white font-semibold text-sm">{S.cropTitle}</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-xl leading-none transition-colors">✕</button>
        </div>

        {/* Crop area */}
        <div className="relative w-full" style={{ height: 300 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { background: '#030712' },
              cropAreaStyle:  { border: `2px solid ${borderColor}` },
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center gap-3 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
          <input
            type="range"
            min={1} max={3} step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-indigo-500"
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
          <button
            onClick={onCancel}
            className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-xl transition-colors"
          >
            {S.cropCancel}
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className={`text-sm ${btnClass} disabled:opacity-50 text-white px-5 py-2 rounded-xl transition-colors font-medium`}
          >
            {applying ? S.cropApplying : S.cropApply}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CropModal
