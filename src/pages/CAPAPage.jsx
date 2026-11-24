import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { formatDistanceToNow, format } from 'date-fns'
import { 
  Brain, 
  Zap, 
  Plus, 
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Calendar,
  User,
  Save,
  Edit,
  Eye,
  MoreVertical,
  Loader2,
  Shield,
  ArrowUpRight,
  Filter,
  X
} from 'lucide-react'
import { fetchCAPAActions, createCAPAAction, updateCAPAAction } from '../store/slices/capaSlice'
import { fetchDeviation } from '../store/slices/deviationsSlice'
import { setAIPanelOpen, setAIPanelStep, addNotification } from '../store/slices/uiSlice'
import { runRCAWorkflow } from '../store/slices/deviationsSlice'
import { clsx } from '../utils/clsx'

const capaSchema = z.object({
  action_type: z.enum(['corrective', 'preventive']),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().min(1, 'Description is required'),
  root_cause_addressed: z.string().optional(),
  assigned_to: z.string().optional(),
  due_date: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'verified']).default('pending'),
  effectiveness_check: z.string().optional(),
})

const statusColors = {
  pending: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  verified: 'bg-purple-100 text-purple-800',
}

const statusLabels = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
}

const typeColors = {
  corrective: 'bg-red-100 text-red-800',
  preventive: 'bg-blue-100 text-blue-800',
}

const typeLabels = {
  corrective: 'Corrective',
  preventive: 'Preventive',
}

function CAPAPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  
  const { list: capaList, loading: capaLoading } = useSelector(state => state.capa)
  const { current: deviation, loading: devLoading } = useSelector(state => state.deviations)
  const { aiRecommendations } = useSelector(state => state.capa)
  const { aiPanelOpen, aiPanelStep } = useSelector(state => state.ui)
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(capaSchema),
    defaultValues: {
      action_type: 'corrective',
      status: 'pending',
    },
  })

  useEffect(() => {
    if (id) {
      dispatch(fetchDeviation(parseInt(id)))
      dispatch(fetchCAPAActions(parseInt(id)))
    }
  }, [dispatch, id])

  const filteredCAPAs = capaList.filter(capa => {
    const typeMatch = filterType === 'all' || capa.action_type === filterType
    const statusMatch = filterStatus === 'all' || capa.status === filterStatus
    return typeMatch && statusMatch
  })

  const handleCreate = async (data) => {
    try {
      await dispatch(createCAPAAction({ deviationId: parseInt(id), data })).unwrap()
      dispatch(addNotification({ type: 'success', message: 'CAPA action created successfully!' }))
      setShowCreateModal(false)
      reset()
    } catch (error) {
      dispatch(addNotification({ type: 'error', message: error.message || 'Failed to create CAPA action' }))
    }
  }

  const handleUpdate = async (capaId, data) => {
    try {
      await dispatch(updateCAPAAction({ capaId, data })).unwrap()
      dispatch(addNotification({ type: 'success', message: 'CAPA action updated successfully!' }))
      setEditingId(null)
    } catch (error) {
      dispatch(addNotification({ type: 'error', message: error.message || 'Failed to update CAPA action' }))
    }
  }

  const handleRunAI = async () => {
    if (!deviation?.raw_input_text) {
      dispatch(addNotification({ type: 'error', message: 'No source document available for AI analysis' }))
      return
    }

    try {
      setAIPanelStep('processing')
      setAIPanelOpen(true)
      
      const result = await dispatch(runRCAWorkflow({
        deviationId: parseInt(id),
      })).unwrap()

      // Store AI CAPA recommendations
      if (result.capa_recommendations) {
        dispatch({ type: 'capa/setAIRecommendations', payload: result.capa_recommendations })
      }

      setAIPanelStep('review')
      dispatch(addNotification({ type: 'success', message: 'AI CAPA recommendations generated!' }))
    } catch (error) {
      dispatch(addNotification({ type: 'error', message: error.message || 'AI analysis failed' }))
      setAIPanelOpen(false)
    }
  }

  const openCreateModal = () => {
    reset({ action_type: 'corrective', status: 'pending' })
    setEditingId(null)
    setShowCreateModal(true)
  }

  const openEditModal = (capa) => {
    setValue('action_type', capa.action_type)
    setValue('title', capa.title)
    setValue('description', capa.description)
    setValue('root_cause_addressed', capa.root_cause_addressed || '')
    setValue('assigned_to', capa.assigned_to || '')
    setValue('due_date', capa.due_date ? format(new Date(capa.due_date), 'yyyy-MM-dd') : '')
    setValue('status', capa.status)
    setValue('effectiveness_check', capa.effectiveness_check || '')
    setEditingId(capa.id)
    setShowCreateModal(true)
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />
      case 'in_progress': return <ArrowUpRight className="w-4 h-4" />
      case 'completed': return <CheckCircle className="w-4 h-4" />
      case 'verified': return <Shield className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  if (devLoading || capaLoading) {
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
          <h1 className="text-2xl font-bold text-gray-900">CAPA Management</h1>
          <p className="text-gray-600 mt-1">Corrective and Preventive Actions for deviation {deviation?.deviation_number}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRunAI}
            disabled={!deviation?.raw_input_text}
            className="btn-primary flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            AI Recommendations
          </button>
          <button
            onClick={openCreateModal}
            className="btn-success flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add CAPA Action
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Actions"
          value={capaList.length}
          icon={CheckCircle}
          color="bg-blue-500"
        />
        <StatCard
          title="Corrective"
          value={capaList.filter(c => c.action_type === 'corrective').length}
          icon={Shield}
          color="bg-red-500"
        />
        <StatCard
          title="Preventive"
          value={capaList.filter(c => c.action_type === 'preventive').length}
          icon={Brain}
          color="bg-blue-500"
        />
        <StatCard
          title="Completed"
          value={capaList.filter(c => c.status === 'completed' || c.status === 'verified').length}
          icon={CheckCircle}
          color="bg-green-500"
        />
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-body">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="input w-auto"
              >
                <option value="all">All Types</option>
                <option value="corrective">Corrective</option>
                <option value="preventive">Preventive</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="input w-auto"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="verified">Verified</option>
              </select>
            </div>
            <span className="text-sm text-gray-500 ml-auto">
              Showing {filteredCAPAs.length} of {capaList.length} actions
            </span>
          </div>
        </div>
      </div>

      {/* CAPA List */}
      <div className="card">
        <div className="card-body p-0">
          {filteredCAPAs.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No CAPA actions yet</h3>
              <p className="text-gray-500 mt-1">Create your first corrective or preventive action</p>
              <button onClick={openCreateModal} className="mt-4 btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add CAPA Action
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredCAPAs.map((capa) => (
                <CAPACard
                  key={capa.id}
                  capa={capa}
                  editingId={editingId}
                  onEdit={openEditModal}
                  onUpdate={handleUpdate}
                  register={register}
                  setValue={setValue}
                  errors={errors}
                  handleSubmit={handleSubmit}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Recommendations Panel */}
      {aiRecommendations && aiRecommendations.length > 0 && (
        <div className="card border-pharma-blue">
          <div className="card-header flex items-center justify-between bg-pharma-blue-light">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Brain className="w-5 h-5 text-pharma-blue" />
              AI-Generated CAPA Recommendations
            </h2>
            <button
              onClick={() => dispatch({ type: 'capa/setAIRecommendations', payload: null })}
              className="p-1 text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="card-body">
            <p className="text-sm text-gray-600 mb-4">
              Review and add these AI-suggested CAPA actions to your investigation.
            </p>
            <div className="space-y-3">
              {aiRecommendations.map((rec, index) => (
                <AIRecommendationCard
                  key={index}
                  recommendation={rec}
                  index={index}
                  onAdd={(data) => handleCreate(data)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <CAPAModal
          isOpen={showCreateModal}
          onClose={() => { setShowCreateModal(false); setEditingId(null); }}
          onSubmit={editingId ? (data) => handleUpdate(editingId, data) : handleCreate}
          editing={!!editingId}
          title={editingId ? 'Edit CAPA Action' : 'Create CAPA Action'}
          register={register}
          errors={errors}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  )
}

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center', color)}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

function CAPACard({ capa, editingId, onEdit, onUpdate, register, setValue, errors, handleSubmit, isSubmitting }) {
  const isEditing = editingId === capa.id

  return (
    <div className={clsx('p-4 hover:bg-gray-50 transition-colors', isEditing && 'bg-blue-50')}>
      {isEditing ? (
        <form onSubmit={handleSubmit((data) => onUpdate(capa.id, data))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select {...register('action_type')} className="input">
                <option value="corrective">Corrective</option>
                <option value="preventive">Preventive</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select {...register('status')} className="input">
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="verified">Verified</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Title *</label>
            <input {...register('title')} className="input" />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
          </div>
          <div>
            <label className="label">Description *</label>
            <textarea {...register('description')} className="textarea" rows={3} />
            {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Root Cause Addressed</label>
              <input {...register('root_cause_addressed')} className="input" />
            </div>
            <div>
              <label className="label">Assigned To</label>
              <input {...register('assigned_to')} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Due Date</label>
              <input {...register('due_date')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Effectiveness Check</label>
              <input {...register('effectiveness_check')} className="input" placeholder="How will effectiveness be verified?" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isSubmitting} className="btn-success flex-1">
              <Save className="w-4 h-4 mr-2" />
              Save
            </button>
            <button type="button" onClick={() => onEdit(null)} className="btn-secondary">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className={clsx('badge', typeColors[capa.action_type])}>
                  {typeLabels[capa.action_type]}
                </span>
                <span className={clsx('badge', statusColors[capa.status])}>
                  {getStatusIcon(capa.status)}
                  {statusLabels[capa.status]}
                </span>
                {capa.ai_generated && (
                  <span className="badge bg-pharma-blue-light text-pharma-blue flex items-center gap-1">
                    <Brain className="w-3 h-3" />
                    AI-Generated
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-gray-900">{capa.title}</h3>
              <p className="text-gray-600 mt-1">{capa.description}</p>
              {capa.root_cause_addressed && (
                <p className="text-sm text-gray-500 mt-2">
                  <strong>Root Cause:</strong> {capa.root_cause_addressed}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => onEdit(capa)} className="btn-ghost p-2" title="Edit">
                <Edit className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              <span>{capa.assigned_to || 'Unassigned'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{capa.due_date ? formatDistanceToNow(new Date(capa.due_date), { addSuffix: true }) : 'No due date'}</span>
            </div>
            {capa.completion_date && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>Completed {formatDistanceToNow(new Date(capa.completion_date), { addSuffix: true })}</span>
              </div>
            )}
          </div>
          {capa.effectiveness_check && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800 flex items-center gap-1">
                <Shield className="w-4 h-4" />
                <strong>Effectiveness Check:</strong> {capa.effectiveness_check}
              </p>
              {capa.effectiveness_date && (
                <p className="text-xs text-green-600 mt-1">Verified {formatDistanceToNow(new Date(capa.effectiveness_date), { addSuffix: true })}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AIRecommendationCard({ recommendation, index, onAdd }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-pharma-blue-200 bg-pharma-blue-50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-pharma-blue-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 bg-pharma-blue text-white rounded-full flex items-center justify-center text-sm font-bold">
            {index + 1}
          </span>
          <div>
            <h4 className="font-medium text-gray-900">{recommendation.title}</h4>
            <p className="text-sm text-gray-500">{recommendation.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('badge', typeColors[recommendation.action_type])}>
            {typeLabels[recommendation.action_type]}
          </span>
          <span className="badge bg-gray-100 text-gray-700">Priority: {recommendation.priority}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-4 border-t border-pharma-blue-200 bg-white space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Root Cause Addressed</label>
              <input defaultValue={recommendation.root_cause_addressed} className="input text-sm" readOnly />
            </div>
            <div>
              <label className="label text-xs">Estimated Effort</label>
              <input defaultValue={recommendation.estimated_effort} className="input text-sm" readOnly />
            </div>
          </div>
          <div>
            <label className="label text-xs">AI Reasoning</label>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{recommendation.ai_reasoning || 'Based on root cause analysis'}</p>
          </div>
          <button
            onClick={() => onAdd({
              action_type: recommendation.action_type,
              title: recommendation.title,
              description: recommendation.description,
              root_cause_addressed: recommendation.root_cause_addressed,
              ai_generated: true,
              ai_reasoning: recommendation.ai_reasoning,
            })}
            className="btn-primary w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add as CAPA Action
          </button>
        </div>
      )}
    </div>
  )
}

function CAPAModal({ isOpen, onClose, onSubmit, editing, title, register, errors, isSubmitting }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Action Type *</label>
              <select {...register('action_type')} className="input">
                <option value="corrective">Corrective</option>
                <option value="preventive">Preventive</option>
              </select>
            </div>
            <div>
              <label className="label">Status *</label>
              <select {...register('status')} className="input">
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="verified">Verified</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Title *</label>
            <input {...register('title')} className={clsx('input', errors.title && 'border-red-300')} />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
          </div>
          <div>
            <label className="label">Description *</label>
            <textarea {...register('description')} className={clsx('textarea', errors.description && 'border-red-300')} rows={3} />
            {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Root Cause Addressed</label>
              <input {...register('root_cause_addressed')} className="input" />
            </div>
            <div>
              <label className="label">Assigned To</label>
              <input {...register('assigned_to')} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Due Date</label>
              <input {...register('due_date')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Effectiveness Check</label>
              <input {...register('effectiveness_check')} className="input" placeholder="How will effectiveness be verified?" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-success">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {editing ? 'Update' : 'Create'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CAPAPage