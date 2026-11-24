import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

export const fetchDeviations = createAsyncThunk(
  'deviations/fetchAll',
  async ({ skip = 0, limit = 100, status, severity } = {}, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams()
      params.append('skip', skip)
      params.append('limit', limit)
      if (status) params.append('status', status)
      if (severity) params.append('severity', severity)
      
      const response = await api.get(`/deviations?${params.toString()}`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch deviations')
    }
  }
)

export const fetchDeviation = createAsyncThunk(
  'deviations/fetchOne',
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/deviations/${id}`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch deviation')
    }
  }
)

export const createDeviation = createAsyncThunk(
  'deviations/create',
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post('/deviations', data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to create deviation')
    }
  }
)

export const updateDeviation = createAsyncThunk(
  'deviations/update',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/deviations/${id}`, data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to update deviation')
    }
  }
)

export const processDocument = createAsyncThunk(
  'deviations/processDocument',
  async ({ deviationId, file, text }, { rejectWithValue }) => {
    try {
      const formData = new FormData()
      if (file) formData.append('file', file)
      if (text) formData.append('text', text)
      
      const response = await api.post(`/deviations/${deviationId}/process-document`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to process document')
    }
  }
)

export const runRCAWorkflow = createAsyncThunk(
  'deviations/runRCA',
  async ({ deviationId, method, additionalContext }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/deviations/${deviationId}/run-rca`, {
        deviation_id: Number(deviationId),
        method,
        additional_context: additionalContext
      })
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to run RCA workflow')
    }
  }
)

export const sendCopilotMessage = createAsyncThunk(
  'deviations/copilot',
  async ({ deviationId, message }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/deviations/${deviationId}/copilot`, { message })
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Copilot update failed')
    }
  }
)

export const fetchLLMProviders = createAsyncThunk(
  'deviations/fetchLLMProviders',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/llm/providers')
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch LLM providers')
    }
  }
)
export const runIntakeCopilot = createAsyncThunk(
  'deviations/intakeCopilot',
  async ({ message, model }, { rejectWithValue }) => {
    try {
      const response = await api.post('/intake/copilot', { message, model })
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Intake copilot failed')
    }
  }
)

const deviationsSlice = createSlice({
  name: 'deviations',
  initialState: {
    list: [],
    current: null,
    loading: false,
    error: null,
    pagination: { skip: 0, limit: 100, total: 0 },
    filters: { status: null, severity: null },
    llmProviders: null,
  },
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearCurrent: (state) => {
      state.current = null
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDeviations.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchDeviations.fulfilled, (state, action) => {
        state.loading = false
        state.list = Array.isArray(action.payload) ? action.payload : []
      })
      .addCase(fetchDeviations.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        if (!Array.isArray(state.list)) {
          state.list = []
        }
      })
      .addCase(fetchDeviation.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchDeviation.fulfilled, (state, action) => {
        state.loading = false
        state.current = action.payload
      })
      .addCase(fetchDeviation.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(fetchLLMProviders.fulfilled, (state, action) => {
        state.llmProviders = action.payload
      })
      .addCase(updateDeviation.fulfilled, (state, action) => {
        const index = state.list.findIndex(d => d.id === action.payload.id)
        if (index !== -1) state.list[index] = action.payload
        if (state.current?.id === action.payload.id) state.current = action.payload
      })
      .addCase(processDocument.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(processDocument.fulfilled, (state, action) => {
        state.loading = false
        if (state.current) {
          state.current = { ...state.current, ...action.payload.deviation_data }
        }
      })
      .addCase(processDocument.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(runRCAWorkflow.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(runRCAWorkflow.fulfilled, (state, action) => {
        state.loading = false
      })
      .addCase(runRCAWorkflow.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { setFilters, clearCurrent, clearError } = deviationsSlice.actions
export default deviationsSlice.reducer
