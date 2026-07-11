import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleClaimDocuments, loadLocalEnv } from './server/notionDocuments.ts'

loadLocalEnv()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'claim-documents-api',
      configureServer(server) {
        server.middlewares.use('/api/claim-documents', (req, res) => {
          void handleClaimDocuments(req, res)
        })
      },
    },
  ],
})
