import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { 
  Search, 
  Filter, 
  Plus, 
  ChevronDown,
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle,
  MoreVertical
} from 'lucide-react'
import { fetchDeviations, setFilters } from '../store/slices/deviationsSlice'
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

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'open', label: 'Open' },
  { value: 'under_investigation', label: 'Under Investigation' },
  { value: 'rca_complete', label: 'RCA Complete' },
  { value: 'capa_pending', label: 'CAPA Pending' },
  { value: 'capa_implemented', label: 'CAPA Implemented' },
  { value: 'closed', label: 'Closed' },
]

const severityOptions = [
  { value: '', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
]

function DeviationList() {
  const dispatch = useDispatch()
  const { list, loading, filters } = useSelector(state => state.deviations)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState(filters.status || '')
  const [severityFilter, setSeverityFilter] = useState(filters.severity || '')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    dispatch(fetchDeviations({ status: statusFilter, severity: severityFilter }))
  }, [dispatch, statusFilter, severityFilter])

  const filteredDeviations = list.filter(deviation => {
    const matchesSearch = deviation.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deviation.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deviation.deviation_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (deviation.product_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (deviation.batch_number?.toLowerCase().includes(searchTerm.toLowerCase()))
    
    return matchesSearch
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deviations</h1>
          <p className="text-gray-600 mt-1">Manage and track quality deviations</p>
        </div>
        <Link to="/deviations/new" className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Deviation
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search deviations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={clsx('btn-secondary flex items-center gap-2', showFilters && 'bg-pharma-blue-light text-pharma-blue')}
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 flex flex-wrap gap-4 pt-4 border-t border-gray-100 animate-slide-up">
              <div className="flex-1 min-w-[200px]">
                <label className="label">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input"
                >
                  {statusOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="label">Severity</label>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="input"
                >
                  {severityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deviations Table */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pharma-blue mx-auto"></div>
              <p className="mt-2 text-gray-500">Loading deviations...</p>
            </div>
          ) : filteredDeviations.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No deviations found</h3>
              <p className="text-gray-500 mt-1">
                {searchTerm || statusFilter || severityFilter 
                  ? 'Try adjusting your search or filters'
                  : 'Create your first deviation to get started'}
              </p>
              {!searchTerm && !statusFilter && !severityFilter && (
                <Link to="/deviations/new" className="mt-4 inline-flex items-center gap-2 text-pharma-blue hover:underline">
                  <Plus className="w-4 h-4" />
                  Create Deviation
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deviation #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product / Batch</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDeviations.map((deviation) => (
                    <tr key={deviation.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link to={`/deviations/${deviation.id}`} className="font-mono text-sm font-medium text-pharma-blue hover:underline">
                          {deviation.deviation_number}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <Link to={`/deviations/${deviation.id}`} className="font-medium text-gray-900 hover:text-pharma-blue">
                          {deviation.title}
                        </Link>
                        <p className="text-sm text-gray-500 truncate max-w-xs mt-1">{deviation.description}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>{deviation.product_name || '-'}</div>
                        {deviation.batch_number && <div>Batch: {deviation.batch_number}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={clsx('badge', severityColors[deviation.severity])}>
                          {deviation.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={clsx('badge', statusColors[deviation.status])}>
                          {deviation.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDistanceToNow(new Date(deviation.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Link to={`/deviations/${deviation.id}/investigation`} className="text-pharma-blue hover:underline text-sm">
                            Investigation
                          </Link>
                          <Link to={`/deviations/${deviation.id}/capa`} className="text-pharma-blue hover:underline text-sm">
                            CAPA
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DeviationList