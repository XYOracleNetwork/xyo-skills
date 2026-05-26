import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [
    svgr(),
    react(),
    checker({ typescript: { tsconfigPath: './tsconfig.json' } }),
  ],
  resolve: { tsconfigPaths: true },
  build: { target: 'esnext', sourcemap: true },
  // Browser-service wiring: React app at :3000 calls its companion xl1-service
  // at :3001 via same-origin /api/* requests, which Vite proxies. Same-origin
  // in dev → no CORS middleware on the service. In prod, a reverse proxy
  // serves the build at / and forwards /api/* — same shape, no CORS either.
  // See xl1-patterns/browser-service-wiring.md.
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
