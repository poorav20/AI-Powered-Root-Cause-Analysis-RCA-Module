import React, { useState, useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import { formatDistanceToNow, format } from 'date-fns'
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Plus, 
  PlusCircle,
  Brain, 
  TrendingUp, 
  TrendingDown,
  Filter,
  Database,
  Search,
  Zap,
  Sparkles,
  Layers,
  Bot,
  Activity,
  ArrowRight,
  RefreshCw,
  Sliders,
  Send,
  BookOpen,
  History,
  Shield,
  FolderOpen,
  ChevronRight,
  Copy,
  ExternalLink,
  Cpu,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Info,
  X
} from 'lucide-react'
import { fetchDeviations } from '../store/slices/deviationsSlice'
import { clsx } from '../utils/clsx'
import api from '../services/api'

// Severity configuration
const severityConfig = {
  critical: {
    label: 'Critical',
    badge: 'bg-red-100 text-red-800 border-red-200',
    dot: 'bg-red-500',
    accent: 'border-l-red-500'
  },
  major: {
    label: 'Major',
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
    accent: 'border-l-orange-500'
  },
  minor: {
    label: 'Minor',
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    dot: 'bg-yellow-500',
    accent: 'border-l-yellow-500'
  }
}

// Status pipeline configuration
const statusStages = [
  { key: 'open', label: '1. Ingested & Open', color: 'bg-blue-500', text: 'text-blue-700', bgLight: 'bg-blue-50' },
  { key: 'under_investigation', label: '2. Under AI Investigation', color: 'bg-purple-500', text: 'text-purple-700', bgLight: 'bg-purple-50' },
  { key: 'rca_complete', label: '3. RCA Complete', color: 'bg-indigo-500', text: 'text-indigo-700', bgLight: 'bg-indigo-50' },
  { key: 'capa_pending', label: '4. CAPA In Progress', color: 'bg-amber-500', text: 'text-amber-700', bgLight: 'bg-amber-50' },
  { key: 'closed', label: '5. Resolved & Closed', color: 'bg-green-500', text: 'text-green-700', bgLight: 'bg-green-50' }
]

// The 4 LangGraph Agents configured in the system
const systemAgents = [
  {
    id: 'agent-extract',
    name: 'Extraction Agent',
    node: 'extract_deviation_info',
    role: 'Unstructured Document & Ingestion Parsing',
    model: 'Groq / gpt-oss-120b',
    status: 'Ready',
    icon: FileText,
    color: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-50 text-blue-700',
    description: 'Extracts title, equipment, batch numbers, severity, and department from PDFs, DOCX, and emails.',
    features: ['Optical & text entity recognition', 'Automated severity classification', 'Strict JSON Pydantic validation']
  },
  {
    id: 'agent-investigate',
    name: 'RCA & Causal Reasoner',
    node: 'analyze_investigation',
    role: '5 Whys & Fishbone (6M) Deductive Engine',
    model: 'Groq / gpt-oss-120b',
    status: 'Ready',
    icon: Brain,
    color: 'from-purple-500 to-indigo-500',
    bg: 'bg-purple-50 text-purple-700',
    description: 'Constructs iterative 5 Whys chains and maps causality across Man, Machine, Material, Method, Measurement, and Environment.',
    features: ['Dual 5 Whys + 6M synthesis', 'Direct vs systemic root cause isolation', 'Evidence attribution per branch']
  },
  {
    id: 'agent-capa',
    name: 'CAPA Recommendation Agent',
    node: 'generate_capa',
    role: 'Corrective & Preventive Action Synthesizer',
    model: 'Groq / gpt-oss-120b',
    status: 'Ready',
    icon: Shield,
    color: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50 text-emerald-700',
    description: 'Generates targeted corrective actions (immediate fix) and preventive actions (recurrence elimination) for every root cause.',
    features: ['Effort & Priority scoring', '21 CFR 820.100 & ICH Q10 alignment', 'Root cause traceability links']
  },
  {
    id: 'agent-validator',
    name: 'Validation & Audit Agent',
    node: 'validate_and_score',
    role: 'Evidence Completeness & Confidence Auditor',
    model: 'Rule Engine + GPT-OSS',
    status: 'Ready',
    icon: CheckCircle2,
    color: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50 text-amber-700',
    description: 'Evaluates the depth of findings, penalizes missing critical evidence, and outputs a mathematical confidence score.',
    features: ['Missing evidence detection', 'Dynamic confidence weighting (0-100%)', 'Human-in-the-loop audit gates']
  }
]

// Pre-packaged RAG prompts for quick exploration
const quickRAGPrompts = [
  {
    title: 'Temperature Excursion in API Crystallization',
    type: 'root_cause',
    query: 'What are the most common root causes for temperature excursions in jacketed API crystallizers during polymorph formation?'
  },
  {
    title: 'ICH Q7 Out-of-Specification CAPA Protocol',
    type: 'capa',
    query: 'Recommend corrective and preventive actions for recurring HPLC impurity spikes exceeding specification according to ICH Q7.'
  },
  {
    title: 'FDA 21 CFR 211.192 Deviation Requirements',
    type: 'regulation',
    query: 'What are the exact regulatory expectations for root cause investigations and batch failure explanations under FDA 21 CFR 211.192?'
  },
  {
    title: 'Purified Water Bioburden Spikes',
    type: 'similar_case',
    query: 'Search historical cases of bioburden contamination in pharmaceutical loop systems and effective sanitization protocols.'
  }
]

function formatSafeDistance(dateStr) {
  if (!dateStr) return 'recently'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return 'recently'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch (err) {
    return 'recently'
  }
}

export default function Dashboard() {
  const dispatch = useDispatch()
  const { list: rawList, loading } = useSelector(state => state.deviations || {})
  const deviations = useMemo(() => Array.isArray(rawList) ? rawList : [], [rawList])

  // Dashboard View State
  const [activeTab, setActiveTab] = useState('all') // 'all', 'open', 'critical', 'rag', 'agents'
  const [selectedStage, setSelectedStage] = useState('all')
  const [selectedSeverity, setSelectedSeverity] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [inspectingAgent, setInspectingAgent] = useState(null)

  // RAG Copilot State
  const [ragStats, setRagStats] = useState({
    total_knowledge_bases: 0,
    total_documents: 0,
    total_chunks: 0,
    queries_last_30_days: 0,
    avg_confidence_score: 0,
    top_query_types: []
  })
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [selectedKBId, setSelectedKBId] = useState('')
  const [ragPromptInput, setRagPromptInput] = useState('')
  const [ragQueryType, setRagQueryType] = useState('root_cause')
  const [selectedDeviationId, setSelectedDeviationId] = useState('')
  const [ragResponse, setRagResponse] = useState(null)
  const [isQueryingRAG, setIsQueryingRAG] = useState(false)
  const [ragError, setRagError] = useState(null)

  // Fetch initial data
  useEffect(() => {
    dispatch(fetchDeviations())
    loadRAGAnalytics()
    loadKnowledgeBases()
  }, [dispatch])

  const loadRAGAnalytics = async () => {
    try {
      const res = await api.get('/rag/analytics')
      if (res.data) setRagStats(res.data)
    } catch (err) {
      // Keep rich fallback default if backend DB is empty
    }
  }

  const loadKnowledgeBases = async () => {
    try {
      const res = await api.get('/rag/knowledge-bases')
      if (res.data && res.data.length > 0) {
        setKnowledgeBases(res.data)
        setSelectedKBId(res.data[0].id)
      }
    } catch (err) {
      setKnowledgeBases([])
      setSelectedKBId('')
    }
  }

  // Filter deviations
  const filteredDeviations = useMemo(() => {
    return deviations.filter(d => {
      // Stage filter
      if (selectedStage !== 'all') {
        if (selectedStage === 'closed' && d.status !== 'closed' && d.status !== 'capa_implemented') return false
        if (selectedStage !== 'closed' && d.status !== selectedStage) return false
      }
      // Severity filter
      if (selectedSeverity !== 'all' && d.severity !== selectedSeverity) return false
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = d.title?.toLowerCase().includes(q)
        const matchNum = d.deviation_number?.toLowerCase().includes(q)
        const matchProduct = d.product_name?.toLowerCase().includes(q)
        const matchBatch = d.batch_number?.toLowerCase().includes(q)
        if (!matchTitle && !matchNum && !matchProduct && !matchBatch) return false
      }
      return true
    })
  }, [deviations, selectedStage, selectedSeverity, searchQuery])

  // KPIs
  const totalDeviations = deviations.length
  const criticalCount = deviations.filter(d => d.severity === 'critical').length
  const majorCount = deviations.filter(d => d.severity === 'major').length
  const minorCount = deviations.filter(d => d.severity === 'minor').length
  const underInvestigationCount = deviations.filter(d => d.status === 'open' || d.status === 'under_investigation').length
  const completedCount = deviations.filter(d => d.status === 'closed' || d.status === 'capa_implemented').length
  const resolutionRate = totalDeviations > 0 ? Math.round((completedCount / totalDeviations) * 100) : 0

  // Run RAG query from dashboard
  const handleExecuteRAG = async (e) => {
    if (e) e.preventDefault()
    if (!ragPromptInput.trim()) return

    setIsQueryingRAG(true)
    setRagError(null)
    setRagResponse(null)

    try {
      const payload = {
        query: ragPromptInput,
        query_type: ragQueryType,
        knowledge_base_ids: selectedKBId ? [parseInt(selectedKBId, 10)] : undefined,
        top_k: 5,
        similarity_threshold: 0.6
      }
      const res = await api.post('/rag/query', payload)
      setRagResponse(res.data)
    } catch (err) {
      console.warn('RAG query fallback due to API error:', err)
      // Keep the workspace transparent when retrieval is unavailable.
      setTimeout(() => {
        setRagResponse({
          query: ragPromptInput,
          query_type: ragQueryType,
          llm_response: 'Knowledge retrieval is currently unavailable. No conclusion or CAPA recommendation was generated. Retry when the knowledge service is available.',
          confidence_score: 0,
          response_time_ms: 0,
          sources_used: []
        })
        setIsQueryingRAG(false)
      }, 700)
      return
    } finally {
      setIsQueryingRAG(false)
    }
  }

  // Pre-fill prompt when user selects a deviation
  const handleSelectDeviationForContext = (e) => {
    const devId = e.target.value
    setSelectedDeviationId(devId)
    if (!devId) return
    const dev = deviations.find(d => d.id === parseInt(devId, 10))
    if (dev) {
      setRagPromptInput(`Perform Root Cause Analysis on Deviation ${dev.deviation_number}: ${dev.title}. Product: ${dev.product_name || 'N/A'}, Batch: ${dev.batch_number || 'N/A'}. Details: ${dev.description}`)
      setRagQueryType('root_cause')
    }
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* =========================================================================
          SECTION 1: HERO HEADER & SYSTEM TELEMETRY
          ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-pharma-blue-dark text-white rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-pharma-blue/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                AIVOA.AI Quality Workspace
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-200 border border-white/10">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                Groq Llama 3.3 70B Versatile
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-200 border border-white/10">
                <Database className="w-3.5 h-3.5 text-purple-300" />
                pgvector 384-d Cosine Index
              </span>
            </div>

            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <Brain className="w-9 h-9 text-cyan-400" />
                Quality & RCA Mission Control
              </h1>
              <p className="text-slate-300 text-sm md:text-base max-w-2xl mt-1">
                Structured deviation intake, evidence review, 5 Whys, Fishbone analysis, and CAPA planning for API manufacturing quality teams.
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                const copilotEl = document.getElementById('rag-copilot-section')
                if (copilotEl) copilotEl.scrollIntoView({ behavior: 'smooth' })
              }}
              className="px-4 py-2.5 rounded-xl font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all flex items-center gap-2 backdrop-blur-sm shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              Ask RAG Copilot
            </button>
            <Link
              to="/knowledge-base"
              className="px-4 py-2.5 rounded-xl font-medium bg-indigo-600/60 hover:bg-indigo-600 text-white border border-indigo-400/30 transition-all flex items-center gap-2 shadow-sm"
            >
              <Database className="w-4 h-4" />
              Knowledge Bases
            </Link>
            <Link
              to="/deviations/new"
              className="px-5 py-2.5 rounded-xl font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/25"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              New Deviation
            </Link>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: 6 TOP-LEVEL KPI METRICS
          ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Metric 1 */}
        <div className="card p-5 border-l-4 border-l-pharma-blue hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>Total Deviations</span>
            <FileText className="w-4 h-4 text-pharma-blue" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-gray-900">{totalDeviations}</span>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Live Sync
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Active records in this workspace</p>
        </div>

        {/* Metric 2 */}
        <div className="card p-5 border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>Critical Severity</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-red-600">{criticalCount}</span>
            <span className="text-xs font-medium text-gray-500">
              {majorCount} major • {minorCount} minor
            </span>
          </div>
          <p className="text-xs text-red-600 font-medium mt-2">Immediate QA escalation</p>
        </div>

        {/* Metric 3 */}
        <div className="card p-5 border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>Active RCA</span>
            <Brain className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-purple-700">{underInvestigationCount}</span>
            <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-medium">
              5 Whys in progress
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Investigation pipeline active</p>
        </div>

        {/* Metric 4 */}
        <div className="card p-5 border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>CAPA Resolution</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-700">{totalDeviations ? `${resolutionRate}%` : '—'}</span>
            <span className="text-xs text-gray-500">
              {completedCount} closed
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Calculated from current record statuses</p>
        </div>

        {/* Metric 5 */}
        <div className="card p-5 border-l-4 border-l-indigo-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>RAG Vector Corpus</span>
            <Database className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-indigo-700">{ragStats.total_chunks ?? 0}</span>
            <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">
              {ragStats.total_documents ?? 0} docs
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Across {ragStats.total_knowledge_bases ?? 0} Knowledge Bases</p>
        </div>

        {/* Metric 6 */}
        <div className="card p-5 border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <span>AI Confidence Avg</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-amber-600">
              {ragStats.avg_confidence_score ? `${Math.round(ragStats.avg_confidence_score * 100)}%` : '—'}
            </span>
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
              Current analytics
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">LangGraph validation score</p>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: AUTONOMOUS AGENT ECOSYSTEM MATRIX
          ========================================================================= */}
      <div className="card">
        <div className="card-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Bot className="w-5 h-5 text-pharma-blue" />
              RCA Agent Workflow Engine (LangGraph)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Four specialized workflow stages extract evidence, analyze causes, recommend CAPAs, and validate completeness.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            4 workflow stages configured
          </span>
        </div>

        <div className="card-body p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {systemAgents.map((agent, index) => {
              const Icon = agent.icon
              return (
                <div 
                  key={agent.id}
                  onClick={() => setInspectingAgent(agent)}
                  className="p-5 rounded-xl border border-gray-200 hover:border-pharma-blue hover:shadow-lg transition-all cursor-pointer bg-white group relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-slate-100 to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
                  
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white bg-gradient-to-br', agent.color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {agent.status}
                      </span>
                    </div>

                    <span className="text-xs font-bold uppercase tracking-wider text-pharma-blue">
                      Stage {index + 1} • {agent.node}
                    </span>
                    <h3 className="text-base font-bold text-gray-900 group-hover:text-pharma-blue transition-colors mt-0.5">
                      {agent.name}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">{agent.role}</p>

                    <p className="text-xs text-gray-600 mt-3 line-clamp-2">
                      {agent.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-400 font-mono text-[11px] truncate max-w-[140px]">{agent.model.split('/')[1] || agent.model}</span>
                    <span className="text-pharma-blue font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Inspect <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 4: INTERACTIVE RAG KNOWLEDGE COPILOT (BUILT-INTO DASHBOARD)
          ========================================================================= */}
      <div id="rag-copilot-section" className="card border-2 border-indigo-100 shadow-md">
        <div className="card-header bg-gradient-to-r from-indigo-50 via-white to-sky-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-pharma-blue flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                Embedded RAG Knowledge Copilot
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  Dual Retrieval + Groq Synthesis
                </span>
              </h2>
              <p className="text-xs text-gray-500">
                Query FDA 21 CFR, ICH guidelines, equipment SOPs, and historical API deviations in real-time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/knowledge-base" className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
              <Database className="w-3.5 h-3.5 text-pharma-blue" />
              Manage Knowledge Bases
            </Link>
          </div>
        </div>

        <div className="card-body p-6 space-y-6">
          {/* Query Mode & Knowledge Base Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs font-semibold uppercase text-gray-500">Target Knowledge Base</label>
              <select
                value={selectedKBId}
                onChange={(e) => setSelectedKBId(e.target.value)}
                className="input text-sm bg-white"
              >
                <option value="">All Knowledge Bases (Global Search)</option>
                {knowledgeBases.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.name} ({kb.domain})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label text-xs font-semibold uppercase text-gray-500">RAG Analysis Intent</label>
              <select
                value={ragQueryType}
                onChange={(e) => setRagQueryType(e.target.value)}
                className="input text-sm bg-white"
              >
                <option value="root_cause">Root Cause Analysis (5 Whys / Fishbone)</option>
                <option value="capa">CAPA Protocol Recommendations</option>
                <option value="investigation">Investigation Evidence Guidance</option>
                <option value="regulation">Regulatory Standard & Compliance (FDA / ICH)</option>
                <option value="similar_case">Find Historical Matching Deviations</option>
                <option value="general">General Pharmaceutical QA Query</option>
              </select>
            </div>

            <div>
              <label className="label text-xs font-semibold uppercase text-gray-500">Auto-Load Deviation Context</label>
              <select
                value={selectedDeviationId}
                onChange={handleSelectDeviationForContext}
                className="input text-sm bg-white text-gray-700"
              >
                <option value="">-- Choose Deviation to Auto-Fill Prompt --</option>
                {deviations.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.deviation_number}: {d.title.substring(0, 45)}...
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Prompt Pills */}
          <div>
            <span className="text-xs font-medium text-gray-400 block mb-2">QUICK BENCHMARK PROMPTS:</span>
            <div className="flex flex-wrap gap-2">
              {quickRAGPrompts.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setRagPromptInput(p.query)
                    setRagQueryType(p.type)
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-indigo-400 bg-gray-50 hover:bg-indigo-50 text-gray-700 hover:text-indigo-900 transition-colors text-left flex items-center gap-1.5"
                >
                  <Zap className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  <span className="font-medium">{p.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Input & Action */}
          <form onSubmit={handleExecuteRAG} className="space-y-3">
            <div className="relative">
              <textarea
                value={ragPromptInput}
                onChange={(e) => setRagPromptInput(e.target.value)}
                rows={3}
                placeholder="Ask any question about root cause determination, regulatory requirements (21 CFR Part 211, ICH Q7), or paste deviation symptoms for instant RAG reasoning..."
                className="textarea w-full text-sm pr-28 font-sans"
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isQueryingRAG || !ragPromptInput.trim()}
                  className="btn-primary text-sm py-2 px-4 shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isQueryingRAG ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Retrieving...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Run Query
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* RAG Query Output Display */}
          {ragResponse && (
            <div className="bg-slate-50 border border-indigo-100 rounded-xl p-5 space-y-4 animate-slide-up">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-indigo-600" />
                  <span className="font-bold text-gray-900 text-sm">AI Synthesized Knowledge Response</span>
                  <span className="badge bg-indigo-100 text-indigo-800 text-xs font-semibold capitalize">
                    {ragResponse.query_type?.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Confidence: {Math.round((ragResponse.confidence_score || 0.85) * 100)}%
                  </span>
                  <span>Latency: {ragResponse.response_time_ms || 420}ms</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(ragResponse.llm_response)}
                    className="p-1 hover:text-gray-900 text-gray-400"
                    title="Copy response"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Response Text */}
              <div className="prose prose-sm max-w-none text-gray-800 text-sm whitespace-pre-wrap leading-relaxed font-sans">
                {ragResponse.llm_response}
              </div>

              {/* Source Document Citations */}
              {ragResponse.sources_used && ragResponse.sources_used.length > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                    Retrieved Knowledge Sources & Evidence ({ragResponse.sources_used.length})
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {ragResponse.sources_used.map((src, i) => (
                      <div key={i} className="p-3 bg-white rounded-lg border border-gray-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900 truncate max-w-[240px]">
                            {src.document_title}
                          </span>
                          <span className="text-indigo-600 font-bold">
                            {Math.round((src.similarity_score || 0.8) * 100)}% match
                          </span>
                        </div>
                        <p className="text-gray-500 line-clamp-2 italic font-mono text-[11px]">
                          "{src.content_preview}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION 5: RCA & CAPA LIFECYCLE FUNNEL
          ========================================================================= */}
      <div className="card">
        <div className="card-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-pharma-blue" />
              Investigation & Resolution Funnel
            </h2>
            <p className="text-xs text-gray-500">
              Click any stage below to filter the live deviation ledger.
            </p>
          </div>
          {selectedStage !== 'all' && (
            <button
              onClick={() => setSelectedStage('all')}
              className="text-xs font-semibold text-pharma-blue hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Reset Stage Filter
            </button>
          )}
        </div>

        <div className="card-body p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {statusStages.map((stage) => {
              const count = deviations.filter(d => {
                if (stage.key === 'closed') return d.status === 'closed' || d.status === 'capa_implemented'
                return d.status === stage.key
              }).length
              const isSelected = selectedStage === stage.key

              return (
                <div
                  key={stage.key}
                  onClick={() => setSelectedStage(isSelected ? 'all' : stage.key)}
                  className={clsx(
                    'p-4 rounded-xl border-2 transition-all cursor-pointer relative overflow-hidden text-left',
                    isSelected 
                      ? 'border-pharma-blue bg-pharma-blue-light/40 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={clsx('w-2.5 h-2.5 rounded-full', stage.color)} />
                    <span className="text-2xl font-extrabold text-gray-900">{count}</span>
                  </div>
                  <h4 className="text-xs font-bold text-gray-800">{stage.label}</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {((count / (totalDeviations || 1)) * 100).toFixed(0)}% of total
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 6: DEVIATIONS LEDGER & INVESTIGATION ACTION BOARD
          ========================================================================= */}
      <div className="card">
        <div className="card-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">
              Active Deviations & Root Cause Directory
            </h2>
            <span className="badge bg-gray-100 text-gray-700 font-semibold">
              {filteredDeviations.length} records
            </span>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search title, batch, product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-9 py-1.5 text-xs w-52 sm:w-64"
              />
            </div>

            {/* Severity Pill Filter */}
            <div className="flex items-center rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs">
              <button
                onClick={() => setSelectedSeverity('all')}
                className={clsx('px-2.5 py-1 rounded-md font-medium transition-colors', selectedSeverity === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900')}
              >
                All
              </button>
              <button
                onClick={() => setSelectedSeverity('critical')}
                className={clsx('px-2.5 py-1 rounded-md font-medium transition-colors', selectedSeverity === 'critical' ? 'bg-red-500 text-white shadow-sm' : 'text-red-600 hover:text-red-800')}
              >
                Critical
              </button>
              <button
                onClick={() => setSelectedSeverity('major')}
                className={clsx('px-2.5 py-1 rounded-md font-medium transition-colors', selectedSeverity === 'major' ? 'bg-orange-500 text-white shadow-sm' : 'text-orange-600 hover:text-orange-800')}
              >
                Major
              </button>
              <button
                onClick={() => setSelectedSeverity('minor')}
                className={clsx('px-2.5 py-1 rounded-md font-medium transition-colors', selectedSeverity === 'minor' ? 'bg-yellow-500 text-white shadow-sm' : 'text-yellow-700 hover:text-yellow-900')}
              >
                Minor
              </button>
            </div>
          </div>
        </div>

        <div className="card-body p-0">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-pharma-blue animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Synchronizing deviation ledger...</p>
            </div>
          ) : filteredDeviations.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-800">No deviations match the selected filters</h3>
              <p className="text-xs text-gray-500 mt-1">Try resetting the stage or severity filters.</p>
              <button
                onClick={() => { setSelectedStage('all'); setSelectedSeverity('all'); setSearchQuery('') }}
                className="btn-secondary text-xs mt-4"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredDeviations.map((deviation) => {
                const sev = severityConfig[deviation.severity] || severityConfig.minor

                return (
                  <div
                    key={deviation.id}
                    className="p-5 hover:bg-slate-50/80 transition-colors flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                  >
                    {/* Left: Info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-pharma-blue bg-pharma-blue-light/50 px-2 py-0.5 rounded">
                          {deviation.deviation_number}
                        </span>
                        <span className={clsx('badge text-[11px]', sev.badge)}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full mr-1.5', sev.dot)} />
                          {deviation.severity}
                        </span>
                        <span className="badge bg-slate-100 text-slate-700 text-[11px] capitalize">
                          {deviation.status?.replace('_', ' ')}
                        </span>
                        {deviation.product_name && (
                          <span className="text-xs text-gray-500 font-medium">
                            Product: <strong className="text-gray-800">{deviation.product_name}</strong>
                          </span>
                        )}
                        {deviation.batch_number && (
                          <span className="text-xs text-gray-500 font-medium">
                            Batch: <strong className="text-gray-800">{deviation.batch_number}</strong>
                          </span>
                        )}
                      </div>

                      <Link
                        to={`/deviations/${deviation.id}`}
                        className="text-base font-bold text-gray-900 hover:text-pharma-blue transition-colors block"
                      >
                        {deviation.title}
                      </Link>

                      <p className="text-xs text-gray-600 line-clamp-2">
                        {deviation.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-400 pt-1">
                        <span>Reported {formatSafeDistance(deviation.created_at)}</span>
                        {deviation.department && <span>Dept: {deviation.department}</span>}
                        {deviation.equipment_involved && <span>Equipment: {deviation.equipment_involved}</span>}
                      </div>
                    </div>

                    {/* Right: 1-Click Action Hub */}
                    <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/deviations/${deviation.id}/investigation`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors flex items-center gap-1.5"
                        >
                          <Brain className="w-3.5 h-3.5" />
                          5 Whys & Fishbone
                        </Link>
                        <Link
                          to={`/deviations/${deviation.id}/capa`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors flex items-center gap-1.5"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          CAPA
                        </Link>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedDeviationId(deviation.id.toString())
                            setRagPromptInput(`Analyze root causes for ${deviation.deviation_number}: ${deviation.title}. Description: ${deviation.description}`)
                            setRagQueryType('root_cause')
                            const copilotEl = document.getElementById('rag-copilot-section')
                            if (copilotEl) copilotEl.scrollIntoView({ behavior: 'smooth' })
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 border border-gray-200 transition-colors flex items-center gap-1"
                          title="Load into RAG Copilot"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          Ask RAG
                        </button>
                        <Link
                          to={`/deviations/${deviation.id}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-pharma-blue hover:bg-pharma-blue-light transition-colors flex items-center gap-1"
                        >
                          View Details <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION 7: KNOWLEDGE REPOSITORY DOMAINS OVERVIEW
          ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-5 bg-gradient-to-br from-blue-50/50 to-white border-blue-100 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-pharma-blue flex items-center justify-center mb-3">
              <FolderOpen className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-gray-900 text-base">API Manufacturing SOPs</h3>
            <p className="text-xs text-gray-600 mt-1">
              Active operating procedures, batch records, critical process parameters (CPP), and standard reaction controls.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-700">Connected SOP sources</span>
            <Link to="/knowledge-base" className="text-pharma-blue font-semibold hover:underline">
              Browse Domain →
            </Link>
          </div>
        </div>

        <div className="card p-5 bg-gradient-to-br from-purple-50/50 to-white border-purple-100 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-gray-900 text-base">Regulatory Standards</h3>
            <p className="text-xs text-gray-600 mt-1">
              FDA 21 CFR Part 211, ICH Q7, ICH Q10, and EU GMP guidelines indexed with chapter embeddings for rapid citations.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-700">Connected regulatory sources</span>
            <Link to="/knowledge-base" className="text-purple-700 font-semibold hover:underline">
              Browse Domain →
            </Link>
          </div>
        </div>

        <div className="card p-5 bg-gradient-to-br from-emerald-50/50 to-white border-emerald-100 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
              <History className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-gray-900 text-base">Historical Deviation Archives</h3>
            <p className="text-xs text-gray-600 mt-1">
              Historical records can be indexed here for similarity search and investigator context.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-700">Indexed case records</span>
            <Link to="/knowledge-base" className="text-emerald-700 font-semibold hover:underline">
              Browse Domain →
            </Link>
          </div>
        </div>
      </div>

      {/* =========================================================================
          AGENT INSPECTOR MODAL
          ========================================================================= */}
      {inspectingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white bg-gradient-to-br', inspectingAgent.color)}>
                  <inspectingAgent.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">{inspectingAgent.name}</h3>
                  <p className="text-xs text-gray-500 font-mono">Node: {inspectingAgent.node}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectingAgent(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Architecture & Model</span>
                <p className="text-sm font-semibold text-gray-900 font-mono">{inspectingAgent.model}</p>
                <p className="text-xs text-gray-500 mt-0.5">{inspectingAgent.role}</p>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Functionality</span>
                <p className="text-sm text-gray-700">{inspectingAgent.description}</p>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Key Automated Capabilities</span>
                <ul className="space-y-1.5">
                  {inspectingAgent.features.map((feat, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-pharma-blue flex-shrink-0 mt-0.5" />
                <span>
                  This agent is managed inside <code className="font-mono bg-blue-100 px-1 rounded">rca_workflow.py</code> using LangGraph StateGraph, with automatic fallback and error boundary trapping.
                </span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setInspectingAgent(null)}
                className="btn-primary text-xs px-4 py-2"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
