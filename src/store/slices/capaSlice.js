import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

export const fetchCAPAActions = createAsyncThunk(
  'capa/fetchAll',
  async (deviationId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/deviations/${deviationId}/capa`)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch CAPA actions')
    }
  }
)

export const createCAPAAction = createAsyncThunk(
  'capa/create',
  async ({ deviationId, data }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/deviations/${deviationId}/capa`, data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to create CAPA action')
    }
  }
)

export const updateCAPAAction = createAsyncThunk(
  'capa/update',
  async ({ capaId, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/capa/${capaId}`, data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to update CAPA action')
    }
  }
)

const capaSlice = createSlice({
  name: 'capa',
  initialState: {
    list: [],
    loading: false,
    error: null,
    aiRecommendations: null,
  },
  reducers: {
    setAIRecommendations: (state, action) => {
      state.aiRecommendations = action.payload
    },
    clearCAPA: (state) => {
      state.list = []
      state.aiRecommendations = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCAPAActions.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCAPAActions.fulfilled, (state, action) => {
        state.loading = false
        state.list = action.payload
      })
      .addCase(fetchCAPAActions.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      .addCase(createCAPAAction.fulfilled, (state, action) => {
        state.list.push(action.payload)
      })
      .addCase(updateCAPAAction.fulfilled, (state, action) => {
        const index = state.list.findIndex(c => c.id === action.payload.id)
        if (index !== -1) state.list[index] = action.payload
      })
  },
})

export const { setAIRecommendations, clearCAPA } = capaSlice.actions
export default capaSlice.reducer