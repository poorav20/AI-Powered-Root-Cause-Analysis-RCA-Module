import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { formatDistanceToNow, format } from 'date-fns'
import { 
  FileText, 
  AlertTriangle, 
  Clock, 
  User, 
  Building2,
  Package,
  Calendar,
  Hash,
  Search,
  Brain,
  Zap,
  Edit,
  Trash2,
  MoreVertical,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react'
import { fetchDeviation, updateDeviation } from '../store/slices/deviationsSlice'
import { addNotification } from '../store/slices/uiSlice'
import { clsx } from '../utils/clsx'

const severityColors = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  major: 'bg-orange-100 text-orange-800 border-orange-200',
  minor: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

const statusColors = {
  open: 'bg-blue-100 text-blue-800',
  under_investigation: 'bg-purple-100 text-purple-800',
  rca_complete: 'bg-indigo-100 text-indigo-800',
  capa_pending: 'bg-orange-100 text-orange-800',
  capa_implemented: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
}

const statusFlow = [
  { key: 'open', label: 'Open' },
  { key: 'under_investigation', label: 'Under Investigation' },
  { key: 'rca_complete', label: 'RCA Complete' },
  { key: 'capa_pending', label: 'CAPA Pending' },
  { key: 'capa_implemented', label: 'CAPA Implemented' },
  { key: 'closed', label: 'Closed' },
]

function DeviationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { current, loading } = useSelector(state => state.deviations)
  const deviation = current

  useEffect(() => {
    if (id) {
      dispatch(fetchDeviation(parseInt(id)))
    }
  }, [dispatch, id])

  if (loading && !deviation) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pharma-blue"></div>
      </div>
    )
  }

  if (!deviation) {
    return (
      <div className="text-center py-12">
        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">Deviation not found</h2>
        <p className="text-gray-500 mt-2">The deviation you're looking for doesn't exist.</p>
        <Link to="/deviations" className="mt-4 inline-flex items-center gap-2 text-pharma-blue hover:underline">
          <Search className="w-4 h-4" />
          Back to Deviations
        </Link>
      </div>
    )
  }

  const currentStatusIndex = statusFlow.findIndex(s => s.key === deviation.status)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-mono text-pharma-blue">{deviation.deviation_number}</span>
            <h1 className="text-2xl font-bold text-gray-900">{deviation.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={clsx('badge', severityColors[deviation.severity])}>
              {deviation.severity.toUpperCase()}
            </span>
            <span className={clsx('badge', statusColors[deviation.status])}>
              {deviation.status.replace('_', ' ')}
            </span>
            {deviation.ai_generated && (
              <span className="badge bg-pharma-blue-light text-pharma-blue flex items-center gap-1">
                <Brain className="w-3 h-3" />
                AI-Generated
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/deviations/${deviation.id}/investigation`} className="btn-primary">
            <Brain className="w-4 h-4 mr-2" />
            Investigation
          </Link>
          <Link to={`/deviations/${deviation.id}/capa`} className="btn-secondary">
            <CheckCircle className="w-4 h-4 mr-2" />
            CAPA
          </Link>
        </div>
      </div>

      {/* Status Progress */}
      <div className="card">
        <div className="card-body">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Investigation Progress</h3>
          <div className="relative">
            <div className="absolute top-3 left-0 right-0 h-0.5 bg-gray-200" />
            <div className="relative flex items-center justify-between">
              {statusFlow.map((step, index) => (
                <div key={step.key} className="flex flex-col items-center">
                  <div className={clsx(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 z-10',
                    index <= currentStatusIndex
                      ? 'bg-pharma-blue text-white'
                      : 'bg-gray-100 text-gray-400'
                  )}>
                    {index <= currentStatusIndex ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      index === 0 ? <Info className="w-5 h-5" /> :
                      index === 1 ? <Search className="w-5 h-5" /> :
                      index === 2 ? <Brain className="w-5 h-5" /> :
                      index === 3 ? <AlertCircle className="w-5 h-5" /> :
                      index === 4 ? <CheckCircle className="w-5 h-5" /> :
                      <CheckCircle className="w-5 h-5" />
                    )}
                  </div>
                  <span className={clsx(
                    'mt-2 text-xs text-center w-24',
                    index <= currentStatusIndex ? 'text-pharma-blue font-medium' : 'text-gray-500'
                  )}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Description</h2>
            </div>
            <div className="card-body">
              <p className="text-gray-700 whitespace-pre-wrap">{deviation.description}</p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailCard
              label="Product / API"
              value={deviation.product_name || 'Not specified'}
              icon={Package}
            />
            <DetailCard
              label="Batch / Lot Number"
              value={deviation.batch_number || 'Not specified'}
              icon={Hash}
            />
            <DetailCard
              label="Manufacturing Date"
              value={deviation.manufacturing_date ? format(new Date(deviation.manufacturing_date), 'MMM d, yyyy') : 'Not specified'}
              icon={Calendar}
            />
            <DetailCard
              label="Department"
              value={deviation.department || 'Not specified'}
              icon={Building2}
            />
            <DetailCard
              label="Reported By"
              value={deviation.reported_by || 'Not specified'}
              icon={User}
            />
            <DetailCard
              label="Assigned To"
              value={deviation.assigned_to || 'Not assigned'}
              icon={User}
            />
            <DetailCard
              label="Equipment Involved"
              value={deviation.equipment_involved || 'Not specified'}
              icon={Package}
              fullWidth
            />
          </div>

          {/* Source Document */}
          {deviation.raw_input_text && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Source Input</h2>
                <span className="text-sm text-gray-500">{deviation.raw_input_text.length} characters</span>
              </div>
              <div className="card-body">
                <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-y-auto font-mono text-sm text-gray-700 whitespace-pre-wrap">
                  {deviation.raw_input_text}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info Card */}
          <div className="card">
            <div className="card-body">
              <h3 className="font-semibold text-gray-900 mb-4">Information</h3>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium">{formatDistanceToNow(new Date(deviation.created_at), { addSuffix: true })}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Last Updated</dt>
                  <dd className="font-medium">{formatDistanceToNow(new Date(deviation.updated_at), { addSuffix: true })}</dd>
                </div>
                {deviation.reported_date && (
                  <div>
                    <dt className="text-gray-500">Reported Date</dt>
                    <dd className="font-medium">{format(new Date(deviation.reported_date), 'MMM d, yyyy HH:mm')}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-gray-900">Quick Actions</h3>
            </div>
            <div className="card-body space-y-2">
              <Link to={`/deviations/${deviation.id}/investigation`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="w-10 h-10 bg-pharma-blue-light rounded-lg flex items-center justify-center">
                  <Brain className="w-5 h-5 text-pharma-blue" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Investigation & RCA</p>
                  <p className="text-sm text-gray-500">Perform root cause analysis</p>
                </div>
              </Link>
              <Link to={`/deviations/${deviation.id}/capa`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">CAPA Management</p>
                  <p className="text-sm text-gray-500">View and manage corrective actions</p>
                </div>
              </Link>
              <button className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors w-full text-left">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Run AI Analysis</p>
                  <p className="text-sm text-gray-500">Re-run AI-powered RCA workflow</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailCard({ label, value, icon: Icon, fullWidth }) {
  return (
    <div className={clsx('card p-4', fullWidth && 'sm:col-span-2')}>
      <dt className="text-sm text-gray-500 flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {label}
      </dt>
      <dd className="mt-1 font-medium text-gray-900">{value}</dd>
    </div>
  )
}

export default DeviationDetail