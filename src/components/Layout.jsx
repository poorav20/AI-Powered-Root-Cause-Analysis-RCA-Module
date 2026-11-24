import { Link, NavLink, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { 
  LayoutDashboard, 
  FileText, 
  Search, 
  PlusCircle, 
  ChevronLeft, 
  ChevronRight,
  Settings,
  HelpCircle,
  Brain,
  Zap,
  Database
} from 'lucide-react'
import { toggleSidebar, setSidebarOpen } from '../store/slices/uiSlice'
import { clsx } from 'clsx'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Deviations', href: '/deviations', icon: FileText },
  { name: 'New Deviation', href: '/deviations/new', icon: PlusCircle },
  { name: 'Knowledge Base', href: '/knowledge-base', icon: Database },
]

function Layout({ sidebarOpen, children }) {
  const dispatch = useDispatch()
  const location = useLocation()
  const { aiPanelOpen } = useSelector(state => state.ui)

  const isActive = (href) => location.pathname.startsWith(href) && href !== '/'

  return (
    <div className="flex h-screen overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-white focus:px-4 focus:py-3 focus:rounded-lg focus:shadow-lg">
        Skip to main content
      </a>
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col',
          sidebarOpen ? 'w-64' : 'w-20'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-pharma-blue rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <span className="text-xl font-bold text-pharma-blue-dark">AIVOA.RCA</span>
            )}
          </div>
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-pharma-blue-light text-pharma-blue-dark'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={sidebarOpen ? undefined : item.name}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {sidebarOpen && <span>{item.name}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500">
            <Zap className="w-4 h-4" />
            {sidebarOpen && <span>AI-Powered RCA Module</span>}
          </div>
          {sidebarOpen && (
            <div className="px-3 pt-2 pb-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
              <span className="w-full text-gray-600">AIVOA.AI · Quality Operations</span>
              <a href="mailto:support@aivoa.ai" className="hover:text-gray-900 hover:underline">Support</a>
              <a href="mailto:preferences@aivoa.ai?subject=Unsubscribe%20request" className="hover:text-gray-900 hover:underline">Email preferences</a>
              <Link to="/legal/privacy" className="hover:text-gray-900 hover:underline">Privacy</Link>
              <Link to="/legal/terms" className="hover:text-gray-900 hover:underline">Terms</Link>
              <Link to="/legal/refund" className="hover:text-gray-900 hover:underline">Refunds</Link>
              <Link to="/legal/cookies" className="hover:text-gray-900 hover:underline">Cookies</Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main
        id="main-content"
        tabIndex="-1"
        className={clsx(
          'flex-1 flex flex-col overflow-hidden transition-all duration-300',
          sidebarOpen ? 'ml-64' : 'ml-20'
        )}
      >
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">
            {location.pathname === '/dashboard' && 'Dashboard'}
            {location.pathname === '/deviations' && 'Deviations'}
            {location.pathname.startsWith('/deviations/') && !location.pathname.endsWith('/new') && 'Deviation Detail'}
            {location.pathname === '/deviations/new' && 'New Deviation'}
            {location.pathname.includes('/investigation') && 'Investigation & RCA'}
            {location.pathname.includes('/capa') && 'CAPA Management'}
          </h1>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Notifications" aria-label="Notifications">
              <HelpCircle className="w-5 h-5 text-gray-500" />
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Settings" aria-label="Settings">
              <Settings className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>

      {/* AI Assistant Panel */}
      {aiPanelOpen && (
        <aside className="fixed inset-y-0 right-0 z-50 w-96 bg-white border-l border-gray-200 shadow-xl">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Brain className="w-5 h-5 text-pharma-blue" />
                AI Assistant
              </h2>
              <button
                onClick={() => dispatch(setAIPanelOpen(false))}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-gray-600">
                AI workflow controls are available in the active RCA page. Review suggestions there before saving.
              </p>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}

export default Layout
