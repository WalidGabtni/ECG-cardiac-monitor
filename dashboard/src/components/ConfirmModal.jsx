function ConfirmModal({ title, message, confirmLabel, danger = true, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          {danger && (
            <div className="w-9 h-9 rounded-lg bg-red-950 border border-red-800 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
          )}
          <div>
            <h3 className="text-white font-semibold text-base">{title}</h3>
            <p className="text-gray-400 text-sm mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`text-sm px-4 py-2 rounded-xl transition-colors font-medium text-white ${
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-teal-600 hover:bg-teal-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
