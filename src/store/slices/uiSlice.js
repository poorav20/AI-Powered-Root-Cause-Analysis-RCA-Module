import { createSlice } from '@reduxjs/toolkit'

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    sidebarOpen: true,
    theme: 'light',
    notifications: [],
    activeModal: null,
    modalProps: {},
    aiPanelOpen: false,
    aiPanelStep: 'input',
  },
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen
    },
    setSidebarOpen: (state, action) => {
      state.sidebarOpen = action.payload
    },
    setTheme: (state, action) => {
      state.theme = action.payload
    },
    addNotification: (state, action) => {
      state.notifications.push({
        id: Date.now(),
        ...action.payload,
      })
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload)
    },
    openModal: (state, action) => {
      state.activeModal = action.payload.type
      state.modalProps = action.payload.props || {}
    },
    closeModal: (state) => {
      state.activeModal = null
      state.modalProps = {}
    },
    setAIPanelOpen: (state, action) => {
      state.aiPanelOpen = action.payload
    },
    setAIPanelStep: (state, action) => {
      state.aiPanelStep = action.payload
    },
  },
})

export const {
  toggleSidebar,
  setSidebarOpen,
  setTheme,
  addNotification,
  removeNotification,
  openModal,
  closeModal,
  setAIPanelOpen,
  setAIPanelStep,
} = uiSlice.actions
export default uiSlice.reducer