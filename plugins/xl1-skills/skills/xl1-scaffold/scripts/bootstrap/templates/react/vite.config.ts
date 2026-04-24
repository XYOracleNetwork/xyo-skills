import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'
import svgr from 'vite-plugin-svgr'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [
    svgr(),
    react(),
    checker({ typescript: { tsconfigPath: './tsconfig.json' } }),
    topLevelAwait(),
  ],
  resolve: { tsconfigPaths: true },
  build: { target: 'esnext', sourcemap: true },
})
