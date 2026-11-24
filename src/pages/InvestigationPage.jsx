import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  Brain, 
  Zap, 
  Search, 
  Target, 
  Plus, 
  Minus, 
  Trash2,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  Save,
  ChevronDown,
  ChevronUp,
  FileText,
  Lightbulb,
  Link as LinkIcon,
  Send,
  MessageSquare,
  Sparkles
} from 'lucide-react'
import { fetchInvestigation, updateInvestigation } from '../store/slices/investigationSlice'
import { fetchDeviation, runRCAWorkflow, sendCopilotMessage } from '../store/slices/deviationsSlice'
import { fetchCAPAActions } from '../store/slices/capaSlice'
import { setAIPanelOpen, setAIPanelStep, addNotification } from '../store/slices/uiSlice'
import { clsx } from '../utils/clsx'

const investigationSchema = z.object({
  method: z.enum(['five_whys', 'fishbone']).default('five_whys'),
  why_1: z.string().optional(),
  why_2: z.string().optional(),
  why_3: z.string().optional(),
  why_4: z.string().optional(),
  why_5: z.string().optional(),
  man_factors: z.array(z.string()).optional(),
  machine_factors: z.array(z.string()).optional(),
  material_factors: z.array(z.string()).optional(),
  method_factors: z.array(z.string()).optional(),
  environment_factors: z.array(z.string()).optional(),
  measurement_factors: z.array(z.string()).optional(),
  root_causes: z.array(z.object({
    cause: z.string(),
    evidence: z.string(),
    confidence: z.number().optional(),
  })).optional(),
  contributing_factors: z.array(z.object({
    factor: z.string(),
    evidence: z.string(),
    category: z.string(),
  })).optional(),
  missing_evidence: z.array(z.object({ value: z.string() })).optional(),
  investigation_summary: z.string().optional(),
  investigator_notes: z.string().optional(),
})

const fishboneCategories = [
  { key: 'man_factors', label: 'Man (People)', icon: '👤', color: 'bg-blue-100 text-blue-800' },
  { key: 'machine_factors', label: 'Machine (Equipment)', icon: '⚙️', color: 'bg-purple-100 text-purple-800' },
  { key: 'material_factors', label: 'Material', icon: '📦', color: 'bg-green-100 text-green-800' },
  { key: 'method_factors', label: 'Method (Process)', icon: '📋', color: 'bg-orange-100 text-orange-800' },
  { key: 'environment_factors', label: 'Environment', icon: '🌡️', color: 'bg-red-100 text-red-800' },
  { key: 'measurement_factors', label: 'Measurement', icon: '📏', color: 'bg-indigo-100 text-indigo-800' },
]

function InvestigationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  
  const { data: investigation, loading: invLoading } = useSelector(state => state.investigation)
  const { current: deviation, loading: devLoading } = useSelector(state => state.deviations)
  const { aiPanelOpen, aiPanelStep } = useSelector(state => state.ui)
  
  const [activeTab, setActiveTab] = useState('five-whys')
  const [copilotMessage, setCopilotMessage] = useState('')
  const [copilotBusy, setCopilotBusy] = useState(false)
  const [copilotMessages, setCopilotMessages] = useState([
    { role: 'assistant', text: 'I can populate or update this RCA from a source record. Try “reassess the temperature excursion” or “the batch number is BATCH-2024-002A”.' },
  ])
  const [expandedSections, setExpandedSections] = useState({
    five_whys: true,
    fishbone: true,
    root_causes: true,
    contributing: true,
    missing: true,
    summary: true,
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(investigationSchema),
    defaultValues: {
      method: 'five_whys',
      man_factors: [],
      machine_factors: [],
      material_factors: [],
      method_factors: [],
      environment_factors: [],
      measurement_factors: [],
      root_causes: [],
      contributing_factors: [],
      missing_evidence: [],
    },
  })

  const { fields: rootCauses, append: addRootCause, remove: removeRootCause, replace: replaceRootCauses } = useFieldArray({
    control,
    name: 'root_causes',
  })

  const { fields: contributingFactors, append: addContributingFactor, remove: removeContributingFactor, replace: replaceContributingFactors } = useFieldArray({
    control,
    name: 'contributing_factors',
  })

  const { fields: missingEvidence, append: addMissingEvidence, remove: removeMissingEvidence, replace: replaceMissingEvidence } = useFieldArray({
    control,
    name: 'missing_evidence',
  })

  useEffect(() => {
    if (id) {
      dispatch(fetchDeviation(parseInt(id)))
      dispatch(fetchInvestigation(parseInt(id)))
      dispatch(fetchCAPAActions(parseInt(id)))
    }
  }, [dispatch, id])

  useEffect(() => {
    if (investigation) {
      setActiveTab(investigation.method === 'fishbone' ? 'fishbone' : 'five-whys')
      const data = {
        method: investigation.method,
        why_1: investigation.why_1,
        why_2: investigation.why_2,
        why_3: investigation.why_3,
        why_4: investigation.why_4,
        why_5: investigation.why_5,
        man_factors: investigation.man_factors || [],
        machine_factors: investigation.machine_factors || [],
        material_factors: investigation.material_factors || [],
        method_factors: investigation.method_factors || [],
        environment_factors: investigation.environment_factors || [],
        measurement_factors: investigation.measurement_factors || [],
        root_causes: (investigation.root_causes || []).map(rootCause => ({
          ...rootCause,
          confidence: typeof rootCause.confidence === 'number' && rootCause.confidence <= 1
            ? Math.round(rootCause.confidence * 100)
            : rootCause.confidence,
        })),
        contributing_factors: investigation.contributing_factors || [],
        missing_evidence: (investigation.missing_evidence || []).map(item => ({ value: item })),
        investigation_summary: investigation.investigation_summary,
        investigator_notes: investigation.investigator_notes,
      }
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && !['root_causes', 'contributing_factors', 'missing_evidence'].includes(key)) {
          setValue(key, data[key])
        }
      })
      replaceRootCauses(data.root_causes)
      replaceContributingFactors(data.contributing_factors)
      replaceMissingEvidence(data.missing_evidence)
    }
  }, [investigation, setValue, replaceRootCauses, replaceContributingFactors, replaceMissingEvidence])

  const handleRunAI = async () => {
    if (!deviation?.raw_input_text && !deviation?.description) {
      dispatch(addNotification({ type: 'error', message: 'Add source text or a deviation description before running RCA' }))
      return
    }

    try {
      setAIPanelStep('processing')
      setAIPanelOpen(true)
      
      const result = await dispatch(runRCAWorkflow({
        deviationId: parseInt(id),
        method: activeTab === 'fishbone' ? 'fishbone' : 'five_whys',
      })).unwrap()

      // Update form with AI results
      const invData = result.investigation
      Object.keys(invData).forEach(key => {
        if (invData[key] !== undefined && key !== 'id' && key !== 'deviation_id' && key !== 'created_at' && key !== 'updated_at') {
          setValue(key, invData[key])
        }
      })

      // Update field arrays
      if (invData.root_causes) {
        replaceRootCauses(invData.root_causes.map(rc => ({
          ...rc,
          confidence: typeof rc.confidence === 'number' && rc.confidence <= 1
            ? Math.round(rc.confidence * 100)
            : rc.confidence,
        })))
      }
      if (invData.contributing_factors) {
        replaceContributingFactors(invData.contributing_factors)
      }
      if (invData.missing_evidence) {
        replaceMissingEvidence(invData.missing_evidence.map(me => ({ value: me })))
      }

      setAIPanelStep('review')
      dispatch(addNotification({ type: 'success', message: 'AI analysis complete! Review the results.' }))
    } catch (error) {
      dispatch(addNotification({ type: 'error', message: error.message || 'AI analysis failed' }))
      setAIPanelOpen(false)
    }
  }

  const handleCopilotSubmit = async (event) => {
    event.preventDefault()
    const message = copilotMessage.trim()
    if (!message || copilotBusy) return
    setCopilotMessages(prev => [...prev, { role: 'user', text: message }])
    setCopilotMessage('')
    setCopilotBusy(true)
    try {
      const result = await dispatch(sendCopilotMessage({ deviationId: parseInt(id), message })).unwrap()
      const invData = result.investigation
      const scalarKeys = ['method', 'why_1', 'why_2', 'why_3', 'why_4', 'why_5', 'man_factors', 'machine_factors', 'material_factors', 'method_factors', 'environment_factors', 'measurement_factors', 'investigation_summary', 'investigator_notes']
      scalarKeys.forEach(key => {
        if (invData[key] !== undefined && !['man_factors', 'machine_factors', 'material_factors', 'method_factors', 'environment_factors', 'measurement_factors'].includes(key)) setValue(key, invData[key])
      })
      if (invData.root_causes) {
        replaceRootCauses(invData.root_causes.map(rootCause => ({ ...rootCause, confidence: rootCause.confidence <= 1 ? Math.round(rootCause.confidence * 100) : rootCause.confidence })))
      }
      if (invData.contributing_factors) {
        replaceContributingFactors(invData.contributing_factors)
      }
      if (invData.missing_evidence) {
        replaceMissingEvidence(invData.missing_evidence.map(item => ({ value: item })))
      }
      setCopilotMessages(prev => [...prev, { role: 'assistant', text: `${result.message} ${result.applied_changes.join(' · ')}` }])
    } catch (error) {
      setCopilotMessages(prev => [...prev, { role: 'assistant', text: error.message || 'I could not apply that update.' }])
    } finally {
      setCopilotBusy(false)
    }
  }

  const onSubmit = async (data) => {
    try {
      const payload = {
        ...data,
        missing_evidence: (data.missing_evidence || []).map(item => item.value).filter(Boolean),
      }
      await dispatch(updateInvestigation({ deviationId: parseInt(id), data: payload })).unwrap()
      dispatch(addNotification({ type: 'success', message: 'Investigation saved successfully!' }))
    } catch (error) {
      dispatch(addNotification({ type: 'error', message: error.message || 'Failed to save investigation' }))
    }
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  if (devLoading || invLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pharma-blue"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link to={`/deviations/${id}`} className="text-pharma-blue hover:underline text-sm mb-2 inline-flex items-center gap-1">
            ← {deviation?.deviation_number}: {deviation?.title}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Investigation & Root Cause Analysis</h1>
          <p className="text-gray-600 mt-1">Analyze the deviation using structured RCA methodologies</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRunAI}
            disabled={!deviation?.raw_input_text && !deviation?.description}
            className="btn-primary flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Run AI Analysis
          </button>
          <button
            type="submit"
            form="investigation-form"
            disabled={isSubmitting}
            className="btn-success flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Save Investigation'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <Brain className="w-5 h-5 text-pharma-blue flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">AI suggestions require qualified-person review</p>
            <p className="text-xs text-blue-800 mt-1">
              Confirm each cause against batch records, equipment logs, analytical evidence, and approved procedures before approval.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>AI confidence</span>
            <span className="font-semibold text-gray-900">
              {investigation?.ai_confidence_score ? `${Math.round(investigation.ai_confidence_score * 100)}%` : 'Not run'}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-pharma-blue rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.round((investigation?.ai_confidence_score || 0) * 100))}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Confidence reflects evidence completeness, not approval.</p>
        </div>
      </div>

      {deviation?.raw_input_text && (
        <div className="card">
          <div className="card-body py-4 flex flex-col md:flex-row md:items-start gap-3">
            <FileText className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source evidence used for analysis</p>
              <p className="text-sm text-gray-700 mt-1 line-clamp-2 whitespace-pre-line">{deviation.raw_input_text}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8">
      {/* Method Tabs */}
      <div className="card">
        <div className="card-body p-0">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px" aria-label="Investigation method tabs">
              <button
                onClick={() => { setActiveTab('five-whys'); setValue('method', 'five_whys') }}
                className={clsx(
                  'px-6 py-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === 'five-whys'
                    ? 'border-pharma-blue text-pharma-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                <Search className="w-4 h-4 inline mr-2" />
                5 Whys Analysis
              </button>
              <button
                onClick={() => { setActiveTab('fishbone'); setValue('method', 'fishbone') }}
                className={clsx(
                  'px-6 py-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === 'fishbone'
                    ? 'border-pharma-blue text-pharma-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                <Target className="w-4 h-4 inline mr-2" />
                Fishbone (6M)
              </button>
            </nav>
          </div>

          <form id="investigation-form" onSubmit={handleSubmit(onSubmit)} className="p-6">
            {/* 5 Whys Tab */}
            {activeTab === 'five-whys' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">5 Whys Analysis</h2>
                  <Info className="w-5 h-5 text-gray-400" title="Ask 'Why?' five times to drill down to the root cause" />
                </div>
                <p className="text-sm text-gray-500">Iteratively ask 'Why?' to identify the root cause of the deviation.</p>

                <div className="space-y-4">
                  {[
                    { key: 'why_1', label: 'Why 1', placeholder: 'Why did the deviation occur?' },
                    { key: 'why_2', label: 'Why 2', placeholder: 'Why did the cause in Why 1 happen?' },
                    { key: 'why_3', label: 'Why 3', placeholder: 'Why did the cause in Why 2 happen?' },
                    { key: 'why_4', label: 'Why 4', placeholder: 'Why did the cause in Why 3 happen?' },
                    { key: 'why_5', label: 'Why 5 (Root Cause)', placeholder: 'Why did the cause in Why 4 happen?' },
                  ].map((why, index) => (
                    <div key={why.key} className={clsx('relative', index === 4 && 'ring-2 ring-pharma-blue')}>
                      <label className="label flex items-center gap-2">
                        <span className="w-6 h-6 bg-pharma-blue text-white rounded-full flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </span>
                        {why.label}
                        {index === 4 && <span className="badge bg-pharma-blue-light text-pharma-blue">Root Cause</span>}
                      </label>
                      <textarea
                        {...register(why.key)}
                        className="textarea"
                        rows={3}
                        placeholder={why.placeholder}
                      />
                      {errors[why.key] && <p className="mt-1 text-sm text-red-600">{errors[why.key].message}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fishbone Tab */}
            {activeTab === 'fishbone' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Fishbone / Ishikawa Diagram (6M)</h2>
                  <Info className="w-5 h-5 text-gray-400" title="Categorize potential causes across 6M categories" />
                </div>
                <p className="text-sm text-gray-500">Brainstorm potential causes across all six categories.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {fishboneCategories.map(cat => (
                    <FishboneCategory
                      key={cat.key}
                      category={cat}
                      register={register}
                      errors={errors}
                      control={control}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Common Sections */}
            <div className="border-t border-gray-200 pt-6 space-y-6">
              {/* Root Causes */}
              <CollapsibleSection
                title="Identified Root Causes"
                icon={Target}
                expanded={expandedSections.root_causes}
                onToggle={() => toggleSection('root_causes')}
                badge={rootCauses.length}
              >
                <div className="space-y-4">
                  {rootCauses.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No root causes identified yet. Add them manually or run AI analysis.</p>
                  ) : (
                    rootCauses.map((cause, index) => (
                      <div key={cause.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 bg-pharma-blue text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </span>
                          <div className="flex-1 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="label">Root Cause</label>
                                <input
                                  {...register(`root_causes.${index}.cause`)}
                                  className="input"
                                  placeholder="Describe the root cause"
                                />
                              </div>
                              <div>
                                <label className="label">Confidence (%)</label>
                                <input
                                  {...register(`root_causes.${index}.confidence`, { valueAsNumber: true })}
                                  type="number"
                                  min="0"
                                  max="100"
                                  className="input"
                                  placeholder="85"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="label">Supporting Evidence</label>
                              <textarea
                                {...register(`root_causes.${index}.evidence`)}
                                className="textarea"
                                rows={2}
                                placeholder="What evidence supports this root cause?"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRootCause(index)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => addRootCause({ cause: '', evidence: '', confidence: 80 })}
                    className="btn-secondary w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Root Cause
                  </button>
                </div>
              </CollapsibleSection>

              {/* Contributing Factors */}
              <CollapsibleSection
                title="Contributing Factors"
                icon={LinkIcon}
                expanded={expandedSections.contributing}
                onToggle={() => toggleSection('contributing')}
                badge={contributingFactors.length}
              >
                <div className="space-y-4">
                  {contributingFactors.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No contributing factors identified yet.</p>
                  ) : (
                    contributingFactors.map((factor, index) => (
                      <div key={factor.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </span>
                          <div className="flex-1 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="label">Factor</label>
                                <input
                                  {...register(`contributing_factors.${index}.factor`)}
                                  className="input"
                                  placeholder="Describe the contributing factor"
                                />
                              </div>
                              <div>
                                <label className="label">Category</label>
                                <select
                                  {...register(`contributing_factors.${index}.category`)}
                                  className="input"
                                >
                                  <option value="">Select category</option>
                                  {fishboneCategories.map(c => (
                                    <option key={c.key} value={c.key}>{c.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="label">Evidence</label>
                                <input
                                  {...register(`contributing_factors.${index}.evidence`)}
                                  className="input"
                                  placeholder="Supporting evidence"
                                />
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeContributingFactor(index)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => addContributingFactor({ factor: '', category: '', evidence: '' })}
                    className="btn-secondary w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Contributing Factor
                  </button>
                </div>
              </CollapsibleSection>

              {/* Missing Evidence */}
              <CollapsibleSection
                title="Missing Evidence / Information Needed"
                icon={AlertCircle}
                expanded={expandedSections.missing}
                onToggle={() => toggleSection('missing')}
                badge={missingEvidence.length}
              >
                <div className="space-y-4">
                  {missingEvidence.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No missing evidence items identified.</p>
                  ) : (
                    missingEvidence.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                        <input
                          {...register(`missing_evidence.${index}.value`)}
                          className="input flex-1 bg-transparent"
                          placeholder="What evidence is missing?"
                        />
                        <button
                          type="button"
                          onClick={() => removeMissingEvidence(index)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => addMissingEvidence({ value: '' })}
                    className="btn-secondary w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Missing Evidence
                  </button>
                </div>
              </CollapsibleSection>

              {/* Investigation Summary */}
              <CollapsibleSection
                title="Investigation Summary"
                icon={FileText}
                expanded={expandedSections.summary}
                onToggle={() => toggleSection('summary')}
              >
                <div className="space-y-4">
                  <div>
                    <label className="label">Summary</label>
                    <textarea
                      {...register('investigation_summary')}
                      className="textarea"
                      rows={4}
                      placeholder="Summarize the investigation findings, root causes, and key evidence..."
                    />
                  </div>
                  <div>
                    <label className="label">Investigator Notes</label>
                    <textarea
                      {...register('investigator_notes')}
                      className="textarea"
                      rows={3}
                      placeholder="Additional notes, observations, or recommendations..."
                    />
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          </form>
        </div>
      </div>
        </div>

        <aside className="xl:col-span-4 xl:sticky xl:top-6 rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-lg overflow-hidden" aria-label="RCA AI copilot">
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-400/15 text-cyan-300 flex items-center justify-center"><Sparkles className="w-5 h-5" aria-hidden="true" /></div>
              <div>
                <h2 className="font-semibold">RCA copilot</h2>
                <p className="text-xs text-slate-400">Populate and update by natural language</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3 max-h-[28rem] overflow-y-auto" aria-live="polite">
            {copilotMessages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={clsx('flex gap-2 text-sm', item.role === 'user' ? 'justify-end' : 'justify-start')}>
                {item.role === 'assistant' && <MessageSquare className="w-4 h-4 text-cyan-300 mt-1 flex-shrink-0" aria-hidden="true" />}
                <p className={clsx('max-w-[85%] rounded-xl px-3 py-2 leading-5', item.role === 'user' ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-slate-200')}>{item.text}</p>
              </div>
            ))}
            {copilotBusy && <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Updating the RCA workspace…</p>}
          </div>
          <form onSubmit={handleCopilotSubmit} className="p-4 border-t border-white/10">
            <label htmlFor="copilot-message" className="sr-only">Message the RCA copilot</label>
            <textarea id="copilot-message" value={copilotMessage} onChange={event => setCopilotMessage(event.target.value)} className="w-full min-h-[88px] rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-slate-400 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300" placeholder="e.g. The batch number is BATCH-2024-002A and affected quantity is 50 kg." />
            <div className="flex items-center justify-between mt-3 gap-3">
              <span className="text-[11px] text-slate-400">AI changes remain editable until saved.</span>
              <button type="submit" disabled={!copilotMessage.trim() || copilotBusy} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-semibold disabled:opacity-50"><Send className="w-4 h-4" aria-hidden="true" /> Apply</button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  )
}

function FishboneCategory({ category, register, errors, control }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: category.key,
  })

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className={clsx('px-4 py-3 font-medium flex items-center gap-2', category.color)}>
        <span>{category.icon}</span>
        {category.label}
        <span className="ml-auto text-sm text-gray-500">{fields.length} factors</span>
      </div>
      <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
        {fields.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No factors added</p>
        ) : (
          fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <input
                {...register(`${category.key}.${index}`)}
                className="input flex-1"
                placeholder="Add a factor..."
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          onClick={() => append('')}
          className="w-full btn-ghost text-sm py-2"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Factor
        </button>
      </div>
    </div>
  )
}

function CollapsibleSection({ title, icon: Icon, expanded, onToggle, badge, children }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 bg-gray-50 flex items-center gap-3 hover:bg-gray-100 transition-colors"
      >
        <Icon className="w-5 h-5 text-gray-500" />
        <span className="font-medium text-gray-900">{title}</span>
        {badge !== undefined && (
          <span className="ml-auto badge bg-gray-100 text-gray-700">{badge}</span>
        )}
        <ChevronDown className={clsx('w-5 h-5 text-gray-400 ml-auto transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="p-4 animate-slide-up">
          {children}
        </div>
      )}
    </div>
  )
}

export default InvestigationPage
