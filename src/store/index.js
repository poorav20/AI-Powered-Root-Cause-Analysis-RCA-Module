import { configureStore } from '@reduxjs/toolkit'
import deviationsReducer from './slices/deviationsSlice'
import investigationReducer from './slices/investigationSlice'
import capaReducer from './slices/capaSlice'
import uiReducer from './slices/uiSlice'

export const store = configureStore({
  reducer: {
    deviations: deviationsReducer,
    investigation: investigationReducer,
    capa: capaReducer,
    ui: uiReducer,
  },
})

// TypeScript types (for reference when using with TypeScript)
// export type RootState = ReturnType<typeof store.getState>
// export type AppDispatch = typeof store.dispatch