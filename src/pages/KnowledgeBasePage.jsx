import { useState, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { formatDistanceToNow, format } from 'date-fns'
import { 
  Database, 
  Plus, 
  Upload, 
  FileText, 
  Search, 
  Settings, 
  Trash2, 
  Edit, 
  Eye,
  Brain,
  Zap,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  Download,
  Copy,
  Filter,
  Columns,
  MoreVertical,
  Shield,
  BookOpen,
  FlaskConical,
  History,
  BarChart2,
  ArrowUpDown,
  ExternalLink
} from 'lucide-react'
import { clsx } from '../utils/clsx'
import api from '../services/api'

// Status configurations
const statusConfig = {
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: Loader2 },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: AlertCircle }
}

const sourceTypeConfig = {
  pdf: { label: 'PDF', icon: FileText, color: 'bg-red-100 text-red-700' },
  docx: { label: 'Word', icon: FileText, color: 'bg-blue-100 text-blue-700' },
  txt: { label: 'Text', icon: FileText, color: 'bg-gray-100 text-gray-700' },
  regulation: { label: 'Regulation', icon: Shield, color: 'bg-purple-100 text-purple-700' },
  guideline: { label: 'Guideline', icon: BookOpen, color: 'bg-indigo-100 text-indigo-700' },
  case_study: { label: 'Case Study', icon: FolderOpen, color: 'bg-orange-100 text-orange-700' },
  research_paper: { label: 'Research', icon: FlaskConical, color: 'bg-pink-100 text-pink-700' },
  sop: { label: 'SOP', icon: Settings, color: 'bg-teal-100 text-teal-700' },
  other: { label: 'Other', icon: FileText, color: 'bg-gray-100 text-gray-700' }
}

const domainConfig = {
  pharmaceutical: { label: 'Pharmaceutical', color: 'bg-pharma-blue-light text-pharma-blue' },
  regulatory: { label: 'Regulatory', color: 'bg-purple-100 text-purple-700' },
  case_studies: { label: 'Case Studies', color: 'bg-orange-100 text-orange-700' },
  manufacturing: { label: 'Manufacturing', color: 'bg-teal-100 text-teal-700' }
}

const queryTypeOptions = [
  { value: 'root_cause', label: 'Root Cause Analysis', icon: Brain, desc: '5 Whys, Fishbone, contributing factors' },
  { value: 'capa', label: 'CAPA Recommendations', icon: Shield, desc: 'Corrective & preventive actions' },
  { value: 'investigation', label: 'Investigation Guidance', icon: Search, desc: 'Next steps, missing evidence' },
  { value: 'similar_case', label: 'Similar Cases', icon: History, desc: 'Historical deviation matching' },
  { value: 'regulation', label: 'Regulatory Query', icon: BookOpen, desc: 'FDA, ICH, EU GMP compliance' },
  { value: 'general', label: 'General Query', icon: Brain, desc: 'Any pharmaceutical QA question' }
]

// Utility components
function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.pending
  const Icon = config.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium', config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

function SourceTypeBadge({ type }) {
  const config = sourceTypeConfig[type] || sourceTypeConfig.other
  const Icon = config.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

function DomainBadge({ domain }) {
  const config = domainConfig[domain] || { label: domain, color: 'bg-gray-100 text-gray-700' }
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium', config.color)}>
      {config.label}
    </span>
  )
}

function ActionButton({ onClick, children, title, variant = 'ghost', disabled, className = '' }) {
  const variants = {
    ghost: 'p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100',
    primary: 'p-2 text-pharma-blue hover:bg-pharma-blue-light',
    danger: 'p-2 text-red-500 hover:bg-red-50',
    secondary: 'p-2 text-gray-600 hover:bg-gray-100'
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx('rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed', variants[variant], className)}
    >
      {children}
    </button>
  )
}

function LoadingSkeleton({ className = '' }) {
  return (
    <div className={clsx('animate-pulse', className)}>
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
  )
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-16">
      <Icon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      <p className="text-gray-500 mt-1">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

// Main Knowledge Base Page
export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState('bases')
  const [selectedKB, setSelectedKB] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showChunkModal, setShowChunkModal] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'updated_at', direction: 'desc' })
  const [docSortConfig, setDocSortConfig] = useState({ key: 'created_at', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [docPage, setDocPage] = useState(1)
  const [pageSize] = useState(10)
  const [queryHistory, setQueryHistory] = useState([])
  
  // Form states
  const [newKB, setNewKB] = useState({ name: '', description: '', domain: 'pharmaceutical' })
  const [uploadForm, setUploadForm] = useState({ 
    title: '', 
    source_type: 'pdf', 
    metadata: '{}',
    file: null
  })
  const [uploadProgress, setUploadProgress] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Data states
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [documents, setDocuments] = useState([])
  const [chunks, setChunks] = useState([])
  const [stats, setStats] = useState({})
  const [queryResult, setQueryResult] = useState(null)
  const [isQuerying, setIsQuerying] = useState(false)

  // Fetch data
  const fetchKnowledgeBases = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await api.get('/rag/knowledge-bases')
      setKnowledgeBases(response.data)
    } catch (err) {
      console.error('Failed to fetch knowledge bases:', err)
      setKnowledgeBases([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchDocuments = useCallback(async (kbId) => {
    try {
      const response = await api.get(`/rag/knowledge-bases/${kbId}/documents`)
      setDocuments(response.data)
    } catch (err) {
      console.error('Failed to fetch documents:', err)
      setDocuments([])
    }
  }, [])

  const fetchKBStats = useCallback(async (kbId) => {
    try {
      const response = await api.get(`/rag/knowledge-bases/${kbId}/stats`)
      setStats(response.data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [])

  const fetchChunks = useCallback(async (docId) => {
    try {
      const response = await api.get(`/rag/documents/${docId}/chunks`)
      setChunks(response.data)
      setShowChunkModal(docId)
    } catch (err) {
      console.error('Failed to fetch chunks:', err)
    }
  }, [])

  useEffect(() => {
    fetchKnowledgeBases()
  }, [fetchKnowledgeBases])

  useEffect(() => {
    if (selectedKB) {
      fetchDocuments(selectedKB.id)
      fetchKBStats(selectedKB.id)
    }
  }, [selectedKB, fetchDocuments, fetchKBStats])

  // Sorting handlers
  const handleSort = (key, config, setConfig) => {
    let direction = 'asc'
    if (config.key === key && config.direction === 'asc') {
      direction = 'desc'
    }
    setConfig({ key, direction })
  }

  const sortedKBs = [...knowledgeBases].sort((a, b) => {
    const aVal = a[sortConfig.key]
    const bVal = b[sortConfig.key]
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const filteredKBs = sortedKBs.filter(kb => 
    kb.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    kb.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    kb.domain.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedDocs = [...documents].sort((a, b) => {
    const aVal = a[docSortConfig.key]
    const bVal = b[docSortConfig.key]
    if (aVal < bVal) return docSortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return docSortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const filteredDocs = sortedDocs.filter(d => 
    d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.source_type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Pagination
  const paginatedKBs = filteredKBs.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.ceil(filteredKBs.length / pageSize)

  const paginatedDocs = filteredDocs.slice((docPage - 1) * pageSize, docPage * pageSize)
  const totalDocPages = Math.ceil(filteredDocs.length / pageSize)

  // Handlers
  const handleCreateKB = async () => {
    if (!newKB.name.trim()) return
    try {
      const response = await api.post('/rag/knowledge-bases', newKB)
      setKnowledgeBases(prev => [response.data, ...prev])
      setShowCreateModal(false)
      setNewKB({ name: '', description: '', domain: 'pharmaceutical' })
    } catch (err) {
      setError('Failed to create knowledge base')
    }
  }

  const handleUpload = async () => {
    if (!selectedKB || !uploadForm.title.trim() || !uploadForm.file) return
    
    const formData = new FormData()
    formData.append('file', uploadForm.file)
    formData.append('title', uploadForm.title)
    formData.append('source_type', uploadForm.source_type)
    formData.append('metadata', uploadForm.metadata)

    setUploadProgress({ status: 'uploading', progress: 0 })
    
    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev.progress >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return { ...prev, progress: prev.progress + 10 }
        })
      }, 200)

      const response = await api.post(
        `/rag/knowledge-bases/${selectedKB.id}/documents/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )

      clearInterval(progressInterval)
      setUploadProgress({ status: 'processing', progress: 100 })
      
      setTimeout(() => {
        setShowUploadModal(false)
        setUploadProgress(null)
        setUploadForm({ title: '', source_type: 'pdf', metadata: '{}', file: null })
        fetchDocuments(selectedKB.id)
      }, 1000)
    } catch (err) {
      clearInterval(progressInterval)
      setUploadProgress({ status: 'failed', progress: 0 })
      setError('Upload failed: ' + err.message)
    }
  }

  const handleDeleteKB = async (kbId) => {
    if (!window.confirm('Delete this knowledge base and all its documents?')) return
    try {
      await api.delete(`/rag/knowledge-bases/${kbId}`)
      setKnowledgeBases(prev => prev.filter(kb => kb.id !== kbId))
      if (selectedKB?.id === kbId) setSelectedKB(null)
    } catch (err) {
      setError('Failed to delete knowledge base')
    }
  }

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Delete this document and all its chunks?')) return
    try {
      await api.delete(`/rag/documents/${docId}`)
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch (err) {
      setError('Failed to delete document')
    }
  }

  const handleReprocessDoc = async (docId) => {
    try {
      await api.post(`/rag/documents/${docId}/reprocess`)
      fetchDocuments(selectedKB.id)
    } catch (err) {
      setError('Failed to reprocess document')
    }
  }

  const executeRAGQuery = async (queryData) => {
    setIsQuerying(true)
    setError(null)
    try {
      const response = await api.post('/rag/query', queryData)
      setQueryResult(response.data)
      setQueryHistory(prev => [response.data, ...prev].slice(0, 10))
    } catch (err) {
      setError('Query failed: ' + err.message)
    } finally {
      setIsQuerying(false)
    }
  }

  const handleRCAQuery = async (deviationText, queryType) => {
    setIsQuerying(true)
    try {
      const response = await api.post('/rag/query/rca', {
        deviation_text: deviationText,
        query_type: queryType
      })
      setQueryResult(response.data)
      setQueryHistory(prev => [response.data, ...prev].slice(0, 10))
    } catch (err) {
      setError('RCA query failed: ' + err.message)
    } finally {
      setIsQuerying(false)
    }
  }

  const SortableHeader = ({ label, key, config, setConfig, icon }) => (
    <th 
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50 select-none"
      onClick={() => handleSort(key, config, setConfig)}
    >
      <div className="flex items-center gap-1">
        {icon && <icon className="w-4 h-4" />}
        {label}
        {config.key === key && (
          <span className="ml-1">
            {config.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </div>
    </th>
  )

  const Pagination = ({ currentPage, totalPages, onPageChange, label = '' }) => (
    totalPages > 1 && (
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
        <span className="text-sm text-gray-500">
          Page {currentPage} of {totalPages} {label}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="btn-ghost p-1.5 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="btn-ghost p-1.5 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-pharma-blue" />
            Knowledge Base Management
          </h1>
          <p className="text-gray-600 mt-1">Manage RAG knowledge bases, documents, and embeddings for AI-powered RCA</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Knowledge Base
          </button>
          {selectedKB && (
            <button onClick={() => setShowUploadModal(true)} className="btn-secondary flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Document
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {selectedKB && Object.keys(stats).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Documents" value={stats.document_count} icon={FileText} color="bg-pharma-blue" />
          <StatCard title="Chunks" value={stats.chunk_count} icon={Database} color="bg-purple-500" />
          <StatCard title="Domain" value={selectedKB.domain} icon={Shield} color="bg-green-500" />
          <StatCard title="Last Updated" value={formatDistanceToNow(new Date(selectedKB.updated_at), { addSuffix: true })} icon={Clock} color="bg-orange-500" />
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="card">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={selectedKB ? "Search documents..." : "Search knowledge bases..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sortConfig.key}
                onChange={(e) => setSortConfig({...sortConfig, key: e.target.value})}
                className="input w-auto text-sm"
              >
                <option value="name">Name</option>
                <option value="domain">Domain</option>
                <option value="document_count">Documents</option>
                <option value="created_at">Created</option>
                <option value="updated_at">Updated</option>
              </select>
              <button
                onClick={() => setSortConfig(prev => ({...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc'}))}
                className="btn-ghost p-2"
                title="Toggle sort direction"
              >
                {sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px" aria-label="Tabs">
            <button
              onClick={() => { setActiveTab('bases'); setSelectedKB(null); setSearchTerm('') }}
              className={clsx(
                'px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                activeTab === 'bases'
                  ? 'border-pharma-blue text-pharma-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <Database className="w-4 h-4" />
              Knowledge Bases <span className="badge bg-gray-100 text-gray-600">{knowledgeBases.length}</span>
            </button>
            {selectedKB && (
              <>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={clsx(
                    'px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                    activeTab === 'documents'
                      ? 'border-pharma-blue text-pharma-blue'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  <FileText className="w-4 h-4" />
                  Documents <span className="badge bg-gray-100 text-gray-600">{documents.length}</span>
                </button>
                <button
                  onClick={() => setActiveTab('query')}
                  className={clsx(
                    'px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                    activeTab === 'query'
                      ? 'border-pharma-blue text-pharma-blue'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  <Brain className="w-4 h-4" />
                  RAG Query
                </button>
                {queryHistory.length > 0 && (
                  <button
                    onClick={() => setActiveTab('history')}
                    className={clsx(
                      'px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                      activeTab === 'history'
                        ? 'border-pharma-blue text-pharma-blue'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    )}
                  >
                    <History className="w-4 h-4" />
                    History <span className="badge bg-gray-100 text-gray-600">{queryHistory.length}</span>
                  </button>
                )}
              </>
            )}
          </nav>
        </div>

        <div className="card-body p-0">
          {/* Knowledge Bases Tab */}
          {activeTab === 'bases' && (
            <KnowledgeBasesTable
              knowledgeBases={paginatedKBs}
              isLoading={isLoading}
              onSelect={setSelectedKB}
              onDelete={handleDeleteKB}
              onViewStats={fetchKBStats}
              sortConfig={sortConfig}
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && selectedKB && (
            <DocumentsTable
              documents={paginatedDocs}
              isLoading={isLoading}
              onDelete={handleDeleteDoc}
              onReprocess={handleReprocessDoc}
              onViewChunks={fetchChunks}
              sortConfig={docSortConfig}
              currentPage={docPage}
              totalPages={totalDocPages}
              onPageChange={setDocPage}
              selectedKB={selectedKB}
            />
          )}

          {/* RAG Query Tab */}
          {activeTab === 'query' && selectedKB && (
            <RAGQueryInterface
              knowledgeBaseId={selectedKB.id}
              knowledgeBaseName={selectedKB.name}
              onQuery={executeRAGQuery}
              onRCAQuery={handleRCAQuery}
              isQuerying={isQuerying}
              queryResult={queryResult}
              queryHistory={queryHistory}
            />
          )}

          {/* Query History Tab */}
          {activeTab === 'history' && (
            <QueryHistoryPanel history={queryHistory} onReRun={executeRAGQuery} />
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateKBModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateKB}
        formData={newKB}
        setFormData={setNewKB}
      />

      <UploadDocumentModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSubmit={handleUpload}
        formData={uploadForm}
        setFormData={setUploadForm}
        progress={uploadProgress}
        selectedKB={selectedKB}
      />

      <ChunkViewerModal
        isOpen={!!showChunkModal}
        onClose={() => setShowChunkModal(null)}
        chunks={chunks}
        documentTitle={documents.find(d => d.id === showChunkModal)?.title}
      />

      {error && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 max-w-md">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Sub Components ====================

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center', color)}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

function KnowledgeBasesTable({ knowledgeBases, isLoading, onSelect, onDelete, onViewStats, sortConfig, currentPage, totalPages, onPageChange }) {
  if (isLoading) {
    return (
      <div className="p-8">
        {[...Array(5)].map((_, i) => <LoadingSkeleton key={i} className="mx-4" />)}
      </div>
    )
  }

  if (knowledgeBases.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No knowledge bases found"
        description="Create your first knowledge base to start building your RAG system"
        action={<button onClick={() => setShowCreateModal(true)} className="btn-primary"><Plus className="w-4 h-4 mr-2" /> Create Knowledge Base</button>}
      />
    )
  }

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader label="Name" key="name" config={sortConfig} setConfig={setSortConfig} icon={FileText} />
            <SortableHeader label="Domain" key="domain" config={sortConfig} setConfig={setSortConfig} icon={Shield} />
            <SortableHeader label="Documents" key="document_count" config={sortConfig} setConfig={setSortConfig} icon={FileText} />
            <SortableHeader label="Created" key="created_at" config={sortConfig} setConfig={setSortConfig} icon={Clock} />
            <SortableHeader label="Updated" key="updated_at" config={sortConfig} setConfig={setSortConfig} icon={Clock} />
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {knowledgeBases.map(kb => (
            <tr key={kb.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-4">
                <div>
                  <p className="font-medium text-gray-900">{kb.name}</p>
                  <p className="text-sm text-gray-500 truncate max-w-xs">{kb.description}</p>
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <DomainBadge domain={kb.domain} />
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <span className="font-medium text-gray-900">{kb.document_count}</span>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDistanceToNow(new Date(kb.created_at), { addSuffix: true })}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDistanceToNow(new Date(kb.updated_at), { addSuffix: true })}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1">
                  <ActionButton 
                    onClick={() => { onSelect(kb); onViewStats(kb.id) }}
                    title="View documents"
                    variant="primary"
                  >
                    <Eye className="w-4 h-4" />
                  </ActionButton>
                  <ActionButton 
                    onClick={() => onDelete(kb.id)}
                    title="Delete"
                    variant="danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </ActionButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  )
}

function DocumentsTable({ documents, isLoading, onDelete, onReprocess, onViewChunks, sortConfig, currentPage, totalPages, onPageChange, selectedKB }) {
  if (isLoading) {
    return (
      <div className="p-8">
        {[...Array(5)].map((_, i) => <LoadingSkeleton key={i} className="mx-4" />)}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents in this knowledge base"
        description="Upload your first document to start building the knowledge base"
        action={<button onClick={() => setShowUploadModal(true)} className="btn-primary"><Upload className="w-4 h-4 mr-2" /> Upload Document</button>}
      />
    )
  }

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader label="Title" key="title" config={sortConfig} setConfig={setSortConfig} icon={FileText} />
            <SortableHeader label="Type" key="source_type" config={sortConfig} setConfig={setSortConfig} icon={Shield} />
            <SortableHeader label="Status" key="processing_status" config={sortConfig} setConfig={setSortConfig} icon={Clock} />
            <SortableHeader label="Chunks" key="chunk_count" config={sortConfig} setConfig={setSortConfig} icon={Database} />
            <SortableHeader label="Created" key="created_at" config={sortConfig} setConfig={setSortConfig} icon={Clock} />
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {documents.map(doc => (
            <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-4">
                <div className="max-w-md">
                  <p className="font-medium text-gray-900 truncate">{doc.title}</p>
                  {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      {Object.entries(doc.metadata).map(([k,v]) => `${k}: ${v}`).join(', ')}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <SourceTypeBadge type={doc.source_type} />
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <StatusBadge status={doc.processing_status} />
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <span className="font-medium text-gray-900">{doc.chunk_count}</span>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1">
                  {doc.processing_status === 'completed' && (
                    <ActionButton 
                      onClick={() => onViewChunks(doc.id)}
                      title="View chunks"
                      variant="secondary"
                    >
                      <Eye className="w-4 h-4" />
                    </ActionButton>
                  )}
                  {doc.processing_status !== 'processing' && (
                    <ActionButton 
                      onClick={() => onReprocess(doc.id)}
                      title="Reprocess"
                      variant="secondary"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </ActionButton>
                  )}
                  <ActionButton 
                    onClick={() => onDelete(doc.id)}
                    title="Delete"
                    variant="danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </ActionButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  )
}

function RAGQueryInterface({ knowledgeBaseId, knowledgeBaseName, onQuery, onRCAQuery, isQuerying, queryResult, queryHistory }) {
  const [query, setQuery] = useState('')
  const [queryType, setQueryType] = useState('root_cause')
  const [selectedDeviation, setSelectedDeviation] = useState('')
  const [useDeviationContext, setUseDeviationContext] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    
    if (useDeviationContext && selectedDeviation.trim()) {
      onRCAQuery(selectedDeviation, queryType)
    } else {
      onQuery({
        query,
        query_type: queryType,
        knowledge_base_ids: [knowledgeBaseId],
        top_k: 8,
        similarity_threshold: 0.65,
        filters: { use_hybrid: true }
      })
    }
  }

  const currentQueryType = queryTypeOptions.find(q => q.value === queryType)

  return (
    <div className="p-6 space-y-6">
      {/* Context Selector */}
      <div className="card p-4 bg-pharma-blue-light/50 border-pharma-blue/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pharma-blue rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Active Knowledge Base</h3>
              <p className="text-sm text-pharma-blue">{knowledgeBaseName}</p>
            </div>
          </div>
          <DomainBadge domain="pharmaceutical" />
        </div>
      </div>

      {/* Query Form */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="card-header">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-pharma-blue" />
            RAG Query
          </h3>
        </div>
        <div className="card-body space-y-4">
          {/* Query Type Selector */}
          <div>
            <label className="label">Query Type</label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {queryTypeOptions.map(q => (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => setQueryType(q.value)}
                  className={clsx(
                    'p-3 rounded-lg border-2 text-left transition-all',
                    queryType === q.value
                      ? 'border-pharma-blue bg-pharma-blue-light text-pharma-blue'
                      : 'border-gray-200 hover:border-pharma-blue hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <q.icon className={clsx('w-5 h-5', queryType === q.value ? 'text-pharma-blue' : 'text-gray-400')} />
                    <span className={clsx('font-medium text-sm', queryType === q.value ? 'text-pharma-blue' : 'text-gray-700')}>
                      {q.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{q.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Deviation Context Toggle */}
          <div className="border-t pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useDeviationContext}
                onChange={(e) => setUseDeviationContext(e.target.checked)}
                className="w-4 h-4 text-pharma-blue border-gray-300 rounded focus:ring-pharma-blue"
              />
              <div>
                <p className="font-medium text-gray-900">Use Deviation Context</p>
                <p className="text-sm text-gray-500">Provide deviation text for targeted RCA/CAPA analysis</p>
              </div>
            </label>
          </div>

          {/* Query Input */}
          <div>
            <label className="label">
              {useDeviationContext ? 'Deviation Description' : 'Your Question'}
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="textarea"
              rows={useDeviationContext ? 6 : 4}
              placeholder={useDeviationContext 
                ? 'Paste deviation report, investigation notes, or describe the quality issue...'
                : 'Ask a question about regulations, case studies, best practices, or request RCA/CAPA guidance...'
              }
            />
          </div>

          {useDeviationContext && (
            <div>
              <label className="label">Deviation Text (Optional - for additional context)</label>
              <textarea
                value={selectedDeviation}
                onChange={(e) => setSelectedDeviation(e.target.value)}
                className="textarea"
                rows={4}
                placeholder="Paste the full deviation report here for more accurate analysis..."
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isQuerying || !query.trim()}
            className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
          >
            {isQuerying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Execute Query
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results */}
      {queryResult && (
        <QueryResultPanel result={queryResult} />
      )}

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold text-gray-900">Quick Actions</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <QuickActionBtn
              icon={Brain}
              title="Analyze Root Causes"
              desc="5 Whys & Fishbone for current deviation"
              onClick={() => { setQueryType('root_cause'); setUseDeviationContext(true) }}
            />
            <QuickActionBtn
              icon={Shield}
              title="Generate CAPA"
              desc="Corrective & preventive actions"
              onClick={() => { setQueryType('capa'); setUseDeviationContext(true) }}
            />
            <QuickActionBtn
              icon={Search}
              title="Investigation Guidance"
              desc="Next steps & missing evidence"
              onClick={() => { setQueryType('investigation'); setUseDeviationContext(true) }}
            />
            <QuickActionBtn
              icon={History}
              title="Find Similar Cases"
              desc="Historical deviation matching"
              onClick={() => { setQueryType('similar_case'); setUseDeviationContext(true) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickActionBtn({ icon: Icon, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className="p-4 border border-gray-200 rounded-xl hover:border-pharma-blue hover:bg-pharma-blue-light/50 transition-all text-left group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gray-100 group-hover:bg-pharma-blue group-hover:text-white rounded-lg flex items-center justify-center transition-colors">
          <Icon className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
        </div>
        <div>
          <p className="font-medium text-gray-900">{title}</p>
          <p className="text-sm text-gray-500">{desc}</p>
        </div>
      </div>
    </button>
  )
}

function QueryResultPanel({ result }) {
  const confidenceColor = result.confidence_score > 0.7 ? 'text-green-600' : 
                          result.confidence_score > 0.4 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="card animate-slide-up">
      <div className="card-header flex items-center justify-between bg-gray-50">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Brain className="w-5 h-5 text-pharma-blue" />
          AI Response
        </h3>
        <div className="flex items-center gap-4 text-sm">
          <span className={clsx('font-medium', confidenceColor)}>
            Confidence: {(result.confidence_score * 100).toFixed(0)}%
          </span>
          <span className="text-gray-500">{result.response_time_ms}ms</span>
          <span className="badge bg-gray-100 text-gray-600 capitalize">{result.query_type.replace('_', ' ')}</span>
        </div>
      </div>
      <div className="card-body">
        <div className="prose max-w-none text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
          {result.llm_response}
        </div>
        
        {result.sources_used && result.sources_used.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-pharma-blue" />
              Sources Used ({result.sources_used.length})
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {result.sources_used.map((source, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{source.document_title}</p>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <SourceTypeBadge type={source.source_type} />
                        <span>Similarity: {(source.similarity_score * 100).toFixed(0)}%</span>
                        {source.knowledge_base && <span>KB: {source.knowledge_base}</span>}
                      </div>
                    </div>
                    {source.content_preview && (
                      <button 
                        className="btn-ghost p-1.5 text-xs flex-shrink-0"
                        onClick={() => navigator.clipboard.writeText(source.content_preview)}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {source.content_preview && (
                    <p className="text-xs text-gray-500 mt-2 font-mono bg-white p-2 rounded max-h-20 overflow-y-auto">
                      {source.content_preview}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QueryHistoryPanel({ history, onReRun }) {
  if (history.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No query history yet"
        description="Your recent queries will appear here"
      />
    )
  }

  return (
    <div className="space-y-3">
      {history.map((item, i) => (
        <div key={i} className="card p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge bg-pharma-blue-light text-pharma-blue capitalize">{item.query_type.replace('_', ' ')}</span>
                <span className="text-xs text-gray-500">{(item.confidence_score * 100).toFixed(0)}% confidence</span>
                <span className="text-xs text-gray-500">{item.response_time_ms}ms</span>
              </div>
              <p className="text-gray-700 truncate">{item.query}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => onReRun(item)}
                className="btn-ghost p-2 text-sm"
                title="Run again"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-600 line-clamp-2">{item.llm_response}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// Modals
function CreateKBModal({ isOpen, onClose, onSubmit, formData, setFormData }) {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl max-w-md w-full animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create Knowledge Base</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="label">Name *</label>
            <input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="input"
              placeholder="e.g., Pharmaceutical Manufacturing KB"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Domain</label>
            <select
              value={formData.domain}
              onChange={(e) => setFormData({...formData, domain: e.target.value})}
              className="input"
            >
              <option value="pharmaceutical">Pharmaceutical</option>
              <option value="regulatory">Regulatory</option>
              <option value="case_studies">Case Studies</option>
              <option value="manufacturing">Manufacturing</option>
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="textarea"
              rows={3}
              placeholder="Describe the purpose and scope of this knowledge base"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={onSubmit} disabled={!formData.name.trim()} className="btn-primary">Create</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function UploadDocumentModal({ isOpen, onClose, onSubmit, formData, setFormData, progress, selectedKB }) {
  if (!isOpen) return null
  
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setFormData({...formData, file, title: formData.title || file.name})
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl max-w-md w-full animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Upload Document</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" disabled={progress}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="label">File *</label>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileChange}
              className="input"
              disabled={progress}
            />
            {formData.file && (
              <p className="text-sm text-gray-500 mt-1">{formData.file.name} ({(formData.file.size / 1024).toFixed(1)} KB)</p>
            )}
          </div>
          <div>
            <label className="label">Title *</label>
            <input
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="input"
              placeholder="Document title"
              disabled={progress}
            />
          </div>
          <div>
            <label className="label">Source Type</label>
            <select
              value={formData.source_type}
              onChange={(e) => setFormData({...formData, source_type: e.target.value})}
              className="input"
              disabled={progress}
            >
              <option value="pdf">PDF</option>
              <option value="docx">Word Document</option>
              <option value="txt">Text File</option>
              <option value="regulation">Regulation</option>
              <option value="guideline">Guideline</option>
              <option value="case_study">Case Study</option>
              <option value="research_paper">Research Paper</option>
              <option value="sop">SOP</option>
            </select>
          </div>
          <div>
            <label className="label">Metadata (JSON)</label>
            <textarea
              value={formData.metadata}
              onChange={(e) => setFormData({...formData, metadata: e.target.value})}
              className="textarea font-mono text-sm"
              rows={3}
              placeholder='{"author": "FDA", "year": 2024, "tags": ["cGMP", "deviation"]}'
              disabled={progress}
            />
          </div>
          
          {progress && (
            <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span>{progress.status === 'uploading' ? 'Uploading...' : progress.status === 'processing' ? 'Processing...' : 'Failed'}</span>
                <span>{progress.progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={clsx('h-full transition-all duration-300', progress.status === 'failed' ? 'bg-red-500' : 'bg-pharma-blue')}
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button onClick={onClose} disabled={progress} className="btn-secondary">Cancel</button>
            <button onClick={onSubmit} disabled={progress || !formData.title.trim() || !formData.file} className="btn-primary">
              {progress ? 'Processing...' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChunkViewerModal({ isOpen, onClose, chunks, documentTitle }) {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] animate-slide-up flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Document Chunks</h2>
            <p className="text-sm text-gray-500">{documentTitle} • {chunks.length} chunks</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chunks.length === 0 ? (
            <EmptyState icon={Database} title="No chunks found" description="This document hasn't been processed yet" />
          ) : (
            chunks.map((chunk, i) => (
              <div key={chunk.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-pharma-blue text-white rounded-full flex items-center justify-center text-xs font-bold">
                      {chunk.chunk_index + 1}
                    </span>
                    <span className="text-sm text-gray-500">{chunk.token_count} tokens</span>
                    {chunk.chunk_metadata?.section_header && (
                      <span className="badge bg-pharma-blue-light text-pharma-blue text-xs">
                        {chunk.chunk_metadata.section_header}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(chunk.content)}
                    className="btn-ghost p-1.5"
                    title="Copy chunk"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-white p-3 rounded max-h-48 overflow-y-auto">
                  {chunk.content}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Mock data for fallback
const mockKnowledgeBases = [
  { id: 1, name: 'Pharmaceutical Manufacturing Knowledge Base', description: 'Core knowledge base for API manufacturing deviations, regulations, and best practices', domain: 'pharmaceutical', document_count: 42, created_at: '2024-01-15T10:30:00Z', updated_at: '2024-11-01T14:22:00Z' },
  { id: 2, name: 'Regulatory Guidelines', description: 'FDA 21 CFR, ICH Guidelines, EU GMP, and other regulatory documents', domain: 'regulatory', document_count: 18, created_at: '2024-02-01T09:00:00Z', updated_at: '2024-10-15T11:30:00Z' },
  { id: 3, name: 'Case Studies', description: 'Historical deviation case studies and lessons learned', domain: 'case_studies', document_count: 25, created_at: '2024-03-10T14:00:00Z', updated_at: '2024-11-05T16:45:00Z' }
]

const mockDocuments = [
  { id: 1, knowledge_base_id: 1, title: 'FDA 21 CFR Part 211 - cGMP for Finished Pharmaceuticals', source_type: 'regulation', processing_status: 'completed', chunk_count: 156, created_at: '2024-01-20T10:00:00Z', metadata: { regulation: '21 CFR 211', year: 2024 } },
  { id: 2, knowledge_base_id: 1, title: 'ICH Q7 Good Manufacturing Practice Guide for Active Pharmaceutical Ingredients', source_type: 'guideline', processing_status: 'completed', chunk_count: 89, created_at: '2024-01-25T14:30:00Z', metadata: { guideline: 'ICH Q7', version: '2024' } },
  { id: 3, knowledge_base_id: 1, title: 'Temperature Excursion Investigation - Case Study 2023-045', source_type: 'case_study', processing_status: 'completed', chunk_count: 34, created_at: '2024-02-10T09:15:00Z', metadata: { deviation_type: 'temperature_excursion', product: 'Paracetamol' } },
  { id: 4, knowledge_base_id: 2, title: 'EU GMP Annex 15 - Qualification and Validation', source_type: 'regulation', processing_status: 'completed', chunk_count: 67, created_at: '2024-02-15T11:00:00Z', metadata: { regulation: 'EU GMP Annex 15' } },
  { id: 5, knowledge_base_id: 3, title: 'OOS Investigation Best Practices - PDA Technical Report', source_type: 'guideline', processing_status: 'processing', chunk_count: 0, created_at: '2024-11-01T10:00:00Z', metadata: { topic: 'OOS investigation' } }
]

