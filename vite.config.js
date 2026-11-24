import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // In Docker, backend is available at http://backend:8000; on local Windows it's http://localhost:8000
  const backendTarget = env.VITE_BACKEND_URL || process.env.VITE_API_URL || (process.env.HOST ? 'http://backend:8000' : 'http://localhost:8000')

  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': {
          target: process.env.DOCKER_CONTAINER ? 'http://backend:8000' : (process.env.VITE_API_URL || 'http://backend:8000'),
          changeOrigin: true,
        },
      },
    },
  }
})
