import { Routes, Route, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useEffect } from 'react'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import DeviationList from './pages/DeviationList'
import DeviationDetail from './pages/DeviationDetail'
import DeviationCreate from './pages/DeviationCreate'
import InvestigationPage from './pages/InvestigationPage'
import CAPAPage from './pages/CAPAPage'
import KnowledgeBasePage from './pages/KnowledgeBasePage'
import LegalPage from './pages/LegalPage'
import CookieConsent from './components/CookieConsent'
import { fetchDeviations } from './store/slices/deviationsSlice'
import { setSidebarOpen } from './store/slices/uiSlice'

function App() {
  const dispatch = useDispatch()
  const { list, loading } = useSelector(state => state.deviations)
  const { sidebarOpen } = useSelector(state => state.ui)

  useEffect(() => {
    dispatch(fetchDeviations())
  }, [dispatch])

  return (
    <div className="min-h-screen bg-gray-50">
      <Layout sidebarOpen={sidebarOpen}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/deviations" element={<DeviationList />} />
            <Route path="/deviations/new" element={<DeviationCreate />} />
            <Route path="/deviations/:id" element={<DeviationDetail />} />
            <Route path="/deviations/:id/investigation" element={<InvestigationPage />} />
            <Route path="/deviations/:id/capa" element={<CAPAPage />} />
            <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
            <Route path="/legal/:section" element={<LegalPage />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
      <CookieConsent />
    </div>
  )
}

export default App
