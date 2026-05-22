import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
      '/module-assets': 'http://localhost:5000',
      '/sessions': 'http://localhost:5000',
      '/td_state_update': 'http://localhost:5000',
      '/td_trigger_shot': 'http://localhost:5000',
    },
  },
})
