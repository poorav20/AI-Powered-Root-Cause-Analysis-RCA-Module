import { useState, useRef, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  Upload, 
  FileText, 
  Brain, 
  Zap, 
  CheckCircle,
  AlertCircle,
  X,
  Loader2
} from 'lucide-react'
import { createDeviation, processDocument, runIntakeCopilot, fetchLLMProviders } from '../store/slices/deviationsSlice'
import { setAIPanelOpen, setAIPanelStep, addNotification } from '../store/slices/uiSlice'
import { clsx } from '../utils/clsx'

const deviationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().min(1, 'Description is required'),
  product_name: z.string().optional(),
  batch_number: z.string().optional(),
  manufacturing_date: z.string().optional(),
  expiry_date: z.string().optional(),
  severity: z.enum(['critical', 'major', 'minor']).default('minor'),
  reported_by: z.string().optional(),
  assigned_to: z.string().optional(),
  department: z.string().optional(),
  equipment_involved: z.string().optional(),
  source_type: z.string().optional(),
  expected_outcome: z.string().optional(),
  actual_outcome: z.string().optional(),
  affected_quantity: z.string().optional(),
  impact_summary: z.string().optional(),
  confirm_authorized: z.boolean().refine(value => value === true, 'Confirm you are authorized to submit this record'),
})

function DeviationCreate() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading } = useSelector(state => state.deviations)
  const { aiPanelOpen, aiPanelStep } = useSelector(state => state.ui)
  
  const [dragActive, setDragActive] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [extractedText, setExtractedText] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [copilotMessage, setCopilotMessage] = useState('')
  const [copilotBusy, setCopilotBusy] = useState(false)
  const [copilotMessages, setCopilotMessages] = useState([
    { role: 'assistant', text: 'Describe the incident, paste an email, or share the expected and actual result. I will map it into the deviation record for your review.' }
  ])
  const [selectedModel, setSelectedModel] = useState('')
  const llmProviders = useSelector(state => state.deviations.llmProviders)

  useEffect(() => {
    dispatch(fetchLLMProviders())
  }, [dispatch])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(deviationSchema),
    defaultValues: {
      severity: 'minor',
      confirm_authorized: false,
    },
  })

  const onDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFile = async (file) => {
    if (!file) return
    
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|txt)$/i)) {
      dispatch(addNotification({ type: 'error', message: 'Invalid file type. Please upload PDF, DOCX, or TXT files.' }))
      return
    }

    setUploadedFile(file)
    setProcessing(true)

    try {
      // Create a temporary deviation first to get an ID
      const tempDeviation = await dispatch(createDeviation({
        title: 'Processing...',
        description: 'Document being processed...',
        severity: 'minor',
      })).unwrap()

      // Process the document
      const result = await dispatch(processDocument({
        deviationId: tempDeviation.id,
        file,
      })).unwrap()

      // Update form with extracted data
      const devData = result.deviation_data
      Object.keys(devData).forEach(key => {
        if (devData[key] && key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
          setValue(key, devData[key])
        }
      })

      // Store AI result for panel
      setAiResult(result)
      setAIPanelStep('review')
      setAIPanelOpen(true)

      dispatch(addNotification({ 
        type: 'success', 
        message: 'Document processed successfully! Review the extracted information.' 
      }))

      // Navigate to the created deviation
      navigate(`/deviations/${tempDeviation.id}`)
    } catch (error) {
      dispatch(addNotification({ 
        type: 'error', 
        message: error.message || 'Failed to process document' 
      }))
    } finally {
      setProcessing(false)
    }
  }

  const handleTextSubmit = async (e) => {
    e.preventDefault()
    if (!extractedText.trim()) return

    setProcessing(true)
    try {
      const tempDeviation = await dispatch(createDeviation({
        title: 'Processing...',
        description: 'Text being processed...',
        severity: 'minor',
      })).unwrap()

      const result = await dispatch(processDocument({
        deviationId: tempDeviation.id,
        text: extractedText,
      })).unwrap()

      const devData = result.deviation_data
      Object.keys(devData).forEach(key => {
        if (devData[key] && key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
          setValue(key, devData[key])
        }
      })

      setAiResult(result)
      setAIPanelStep('review')
      setAIPanelOpen(true)

      dispatch(addNotification({ 
        type: 'success', 
        message: 'Text processed successfully! Review the extracted information.' 
      }))

      navigate(`/deviations/${tempDeviation.id}`)
    } catch (error) {
      dispatch(addNotification({ 
        type: 'error', 
        message: error.message || 'Failed to process text' 
      }))
    } finally {
      setProcessing(false)
    }
  }

  const onSubmit = async (data) => {
    try {
      const { confirm_authorized: _consent, ...record } = data
      const result = await dispatch(createDeviation(record)).unwrap()
      dispatch(addNotification({ type: 'success', message: 'Deviation created successfully!' }))
      navigate(`/deviations/${result.id}`)
    } catch (error) {
      dispatch(addNotification({ type: 'error', message: error.message || 'Failed to create deviation' }))
    }
  }

  const handleCopilotSubmit = async (e) => {
    e.preventDefault()
    const message = copilotMessage.trim()
    if (!message || copilotBusy) return
    setCopilotMessages(messages => [...messages, { role: 'user', text: message }])
    setCopilotMessage('')
    setCopilotBusy(true)
    try {
      const result = await dispatch(runIntakeCopilot({ message, model: selectedModel || undefined })).unwrap()
      Object.entries(result.deviation_data || {}).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') setValue(key, value)
      })
      setAiResult(result)
      const missing = result.missing_information?.length ? ` I still need: ${result.missing_information.slice(0, 2).join('; ')}.` : ''
      setCopilotMessages(messages => [...messages, { role: 'assistant', text: `${result.message} Confidence: ${Math.round((result.confidence_score || 0) * 100)}%.${missing}` }])
    } catch (error) {
      setCopilotMessages(messages => [...messages, { role: 'assistant', text: error || 'I could not process that source record.' }])
    } finally {
      setCopilotBusy(false)
    }
  }

  const removeFile = () => {
    setUploadedFile(null)
    setExtractedText('')
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Deviation</h1>
        <p className="text-gray-600 mt-1">Describe the event once. Review the structured record before it enters the quality system.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="card border-slate-200 bg-slate-50/60">
          <div className="card-body">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-slate-900 p-2.5 text-white"><Brain className="w-5 h-5" aria-hidden="true" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Evidence intake</p>
                <h2 className="text-lg font-semibold text-slate-900">Start with the source record</h2>
                <p className="mt-1 text-sm text-slate-600">The fields below are a review surface. Use the copilot to populate them, then correct anything that does not match the approved evidence.</p>
              </div>
            </div>
            {aiResult && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">AI mapped the source record. Review the highlighted structure and missing evidence before creating the deviation.</div>}
          </div>
        </div>

        <aside className="rounded-2xl bg-slate-950 text-slate-100 shadow-xl lg:sticky lg:top-6 overflow-hidden" aria-label="RCA intake copilot">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /><h2 className="font-semibold">RCA Copilot</h2></div><span className="text-xs text-slate-400">AI-assisted intake</span></div>
            <p className="mt-1 text-sm text-slate-400">Source → structured deviation → investigator review</p>
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto px-4 py-4">
            {copilotMessages.map((item, index) => <div key={index} className={clsx('rounded-xl px-3 py-2.5 text-sm leading-6', item.role === 'user' ? 'ml-6 bg-indigo-500 text-white' : 'mr-3 bg-white/10 text-slate-200')}>{item.text}</div>)}
            {copilotBusy && <div className="mr-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Mapping evidence…</div>}
          </div>
          <form onSubmit={handleCopilotSubmit} className="border-t border-white/10 p-4">
            {llmProviders?.providers?.length > 0 && (
              <div className="mb-3">
                <label htmlFor="model-select" className="sr-only">Model</label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                >
                  <option value="">Auto (best available)</option>
                  {llmProviders.providers.map((p) => (
                    <option key={p} value={`${p}:${llmProviders.models[p]}`}>
                      {p} — {llmProviders.models[p]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label htmlFor="copilot-message" className="sr-only">Describe the incident for the RCA Copilot</label>
            <textarea id="copilot-message" value={copilotMessage} onChange={e => setCopilotMessage(e.target.value)} className="min-h-[110px] w-full resize-none rounded-xl border border-white/15 bg-white/10 p-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40" placeholder="Example: The reactor temperature reached 86°C during addition. The approved range was 78–82°C. Batch API-2406-02 was quarantined; 50 kg may be affected." />
            <button type="submit" disabled={!copilotMessage.trim() || copilotBusy} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"><Zap className="h-4 w-4" aria-hidden="true" /> {copilotBusy ? 'Analyzing source' : 'Populate review form'}</button>
            <p className="mt-3 text-center text-xs text-slate-500">Suggestions require qualified investigator review.</p>
          </form>
        </aside>
      </div>

      {/* AI Document Processing Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Brain className="w-5 h-5 text-pharma-blue" />
            AI Document Processing
          </h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* File Upload */}
            <div>
              <label className="label">Upload Document (PDF, DOCX, TXT)</label>
              <div
                className={clsx(
                  'border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200',
                  dragActive ? 'border-pharma-blue bg-pharma-blue-light' : 'border-gray-200 hover:border-pharma-blue',
                  uploadedFile ? 'border-green-300 bg-green-50' : ''
                )}
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                  className="hidden"
                />
                
                {uploadedFile ? (
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-green-200">
                      <FileText className="w-8 h-8 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">{uploadedFile.name}</p>
                        <p className="text-sm text-gray-500">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button
                      onClick={removeFile}
                      className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 mb-1">Drag & drop a document or click to browse</p>
                    <p className="text-sm text-gray-400">PDF, DOCX, or TXT files up to 10MB</p>
                  </div>
                )}
              </div>
              
              {processing && (
                <div className="mt-4 p-4 bg-pharma-blue-light rounded-lg flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-pharma-blue animate-spin" />
                  <span className="text-pharma-blue-dark">Processing document with AI...</span>
                </div>
              )}
            </div>

            {/* Text Input */}
            <div>
              <label className="label">Or Paste Text / Email</label>
              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                placeholder="Paste deviation report, email, or investigation notes here..."
                className="textarea"
                rows={6}
              />
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={!extractedText.trim() || processing}
                className="btn-primary mt-3 w-full sm:w-auto"
              >
                <Zap className="w-4 h-4 mr-2" />
                Process with AI
              </button>
            </div>
          </div>

          {/* AI Results Preview */}
          {aiResult && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200 animate-slide-up">
              <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                AI Extraction Results (Confidence: {(aiResult.confidence_score * 100).toFixed(0)}%)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Title:</span>
                  <span className="ml-2 font-medium">{aiResult.deviation_data.title}</span>
                </div>
                <div>
                  <span className="text-gray-500">Product:</span>
                  <span className="ml-2 font-medium">{aiResult.deviation_data.product_name || 'Not detected'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Batch:</span>
                  <span className="ml-2 font-medium">{aiResult.deviation_data.batch_number || 'Not detected'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Severity:</span>
                  <span className="ml-2 font-medium capitalize">{aiResult.deviation_data.severity}</span>
                </div>
              </div>
              {aiResult.missing_information.length > 0 && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 font-medium">Missing Information:</p>
                  <ul className="list-disc list-inside text-sm text-yellow-700 mt-1">
                    {aiResult.missing_information.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Deviation Details</h2>
          </div>
          <div className="card-body space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="title" className="label">Title *</label>
                <input
                  {...register('title')}
                  id="title"
                  className={clsx('input', errors.title && 'border-red-300 focus:border-red-500 focus:ring-red-500')}
                  placeholder="Brief description of the deviation"
                />
                {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
              </div>

              <div>
                <label htmlFor="severity" className="label">Severity *</label>
                <select {...register('severity')} id="severity" className="input">
                  <option value="critical">Critical</option>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Evidence context</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div><label htmlFor="source_type" className="label">Source of record</label><select {...register('source_type')} id="source_type" className="input"><option value="">Select source</option><option value="email">Email / notification</option><option value="healthcare provider">Hospital / pharmacy report</option><option value="batch record">Batch record</option><option value="equipment log">Equipment or SCADA log</option><option value="laboratory record">Laboratory record</option><option value="quality record">Quality record</option></select></div>
                <div><label htmlFor="affected_quantity" className="label">Affected quantity / extent</label><input {...register('affected_quantity')} id="affected_quantity" className="input" placeholder="e.g., 50 kg; one batch; 12 samples" /></div>
              </div>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div><label htmlFor="expected_outcome" className="label">Expected outcome</label><textarea {...register('expected_outcome')} id="expected_outcome" className="textarea" rows={4} placeholder="Approved target, limit, or intended result" /></div>
                <div><label htmlFor="actual_outcome" className="label">Actual outcome</label><textarea {...register('actual_outcome')} id="actual_outcome" className="textarea" rows={4} placeholder="Observed result and evidence reference" /></div>
              </div>
              <div className="mt-6"><label htmlFor="impact_summary" className="label">Impact and containment</label><textarea {...register('impact_summary')} id="impact_summary" className="textarea" rows={3} placeholder="Potential product, process, compliance, or related-lot impact" /></div>
            </div>

            <div>
              <label htmlFor="description" className="label">Description *</label>
              <textarea
                {...register('description')}
                id="description"
                className={clsx('textarea', errors.description && 'border-red-300 focus:border-red-500 focus:ring-red-500')}
                rows={4}
                placeholder="Detailed description of what happened, when, where, and impact"
              />
              {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="product_name" className="label">Product / API Name</label>
                <input
                  {...register('product_name')}
                  id="product_name"
                  className="input"
                  placeholder="e.g., Aspirin API, Paracetamol Intermediate"
                />
              </div>

              <div>
                <label htmlFor="batch_number" className="label">Batch / Lot Number</label>
                <input
                  {...register('batch_number')}
                  id="batch_number"
                  className="input"
                  placeholder="e.g., BATCH-2024-001"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="manufacturing_date" className="label">Manufacturing Date</label>
                <input
                  {...register('manufacturing_date')}
                  id="manufacturing_date"
                  type="date"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="expiry_date" className="label">Expiry Date</label>
                <input {...register('expiry_date')} id="expiry_date" type="date" className="input" />
              </div>

              <div>
                <label htmlFor="department" className="label">Department</label>
                <select {...register('department')} id="department" className="input">
                  <option value="">Select department</option>
                  <option value="Production">Production</option>
                  <option value="Quality Control">Quality Control</option>
                  <option value="Quality Assurance">Quality Assurance</option>
                  <option value="Packaging">Packaging</option>
                  <option value="Warehouse">Warehouse</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="reported_by" className="label">Reported By</label>
                <input
                  {...register('reported_by')}
                  id="reported_by"
                  className="input"
                  placeholder="Name of person reporting"
                />
              </div>

              <div>
                <label htmlFor="assigned_to" className="label">Assigned To</label>
                <input
                  {...register('assigned_to')}
                  id="assigned_to"
                  className="input"
                  placeholder="Investigator name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="equipment_involved" className="label">Equipment Involved</label>
              <textarea
                {...register('equipment_involved')}
                id="equipment_involved"
                className="textarea"
                rows={2}
                placeholder="Equipment, instruments, or systems involved"
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input {...register('confirm_authorized')} type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 text-pharma-blue focus:ring-pharma-blue" />
                <span className="text-sm text-gray-700">
                  I confirm that I am authorized to submit this quality record and that it contains only information necessary for the investigation. I will not include patient data, passwords, or unrelated personal information.
                </span>
              </label>
              {errors.confirm_authorized && <p className="mt-2 text-sm text-red-600">{errors.confirm_authorized.message}</p>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-end">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || loading}
            className="btn-primary"
          >
            {isSubmitting || loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Create Deviation
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default DeviationCreate
