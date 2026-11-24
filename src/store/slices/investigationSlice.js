import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

export const fetchInvestigation = createAsyncThunk(
  'investigation/fetch',
  async (deviationId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/deviations/${deviationId}/investigation`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch investigation')
    }
  }
)

export const updateInvestigation = createAsyncThunk(
  'investigation/update',
  async ({ deviationId, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/deviations/${deviationId}/investigation`, data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to update investigation')
    }
  }
)

const investigationSlice = createSlice({
  name: 'investigation',
  initialState: {
    data: null,
    loading: false,
    error: null,
    activeTab: 'five-whys',
    aiSuggestions: null,
    showAIAssistant: false,
  },
  reducers: {
    setActiveTab: (state, action) => {
      state.activeTab = action.payload
    },
    setAISuggestions: (state, action) => {
      state.aiSuggestions = action.payload
    },
    setShowAIAssistant: (state, action) => {
      state.showAIAssistant = action.payload
    },
    clearInvestigation: (state) => {
      state.data = null
      state.aiSuggestions = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInvestigation.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchInvestigation.fulfilled, (state, action) => {
        state.loading = false
        state.data = action.payload
      })
      .addCase(fetchInvestigation.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(updateInvestigation.fulfilled, (state, action) => {
        state.data = action.payload
      })
  },
})

export const { setActiveTab, setAISuggestions, setShowAIAssistant, clearInvestigation } = investigationSlice.actions
export default investigationSlice.reducer