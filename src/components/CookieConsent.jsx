import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, X } from 'lucide-react'

const STORAGE_KEY = 'aivoa.cookie-consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(!localStorage.getItem(STORAGE_KEY))
  }, [])

  const choose = (value) => {
    localStorage.setItem(STORAGE_KEY, value)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-4 sm:p-6" role="dialog" aria-label="Cookie preferences">
      <div className="max-w-4xl mx-auto rounded-2xl border border-gray-200 bg-white shadow-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-blue-50 text-pharma-blue items-center justify-center flex-shrink-0">
            <Cookie className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-base font-semibold text-gray-900">Privacy choices</h2>
              <button type="button" onClick={() => choose('necessary')} className="p-1 rounded-md text-gray-500 hover:bg-gray-100" aria-label="Close cookie preferences">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-1 max-w-3xl">
              We use necessary storage to keep the workspace secure and remember your privacy choice. Optional analytics are off unless you enable them.
              Read the <Link to="/legal/cookies" className="text-pharma-blue underline">Cookie Policy</Link>.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={() => choose('necessary')} className="btn-secondary">Use necessary only</button>
              <button type="button" onClick={() => choose('all')} className="btn-primary">Allow optional cookies</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
