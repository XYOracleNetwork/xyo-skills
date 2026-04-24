import type { Template } from '../template.js'

export const reactTemplate: Template = {
  name: 'react',
  description: 'React + Vite + TypeScript XL1 dApp',
  deps: {
    runtime: [
      'react',
      'react-dom',
      '@xyo-network/sdk-js',
      '@xyo-network/xl1-sdk',
      '@xyo-network/react-chain-client',
    ],
    // Peers-of-peers (emotion is peer of @mui/material) and non-peer extras.
    // The 'events' polyfill covers @metamask/safe-event-emitter's direct
    // import of Node's 'events' module from the wallet postMessage transport.
    extras: ['@emotion/react', '@emotion/styled', 'events'],
    dev: [
      '@xylabs/toolchain',
      // tsconfig-react extends tsconfig-dom extends tsconfig — all three need
      // to be direct dev deps so the ESLint import resolver can walk the
      // tsconfig extends chain.
      '@xylabs/tsconfig',
      '@xylabs/tsconfig-dom',
      '@xylabs/tsconfig-react',
      '@xylabs/eslint-config-react-flat',
      '@types/react',
      '@types/react-dom',
      '@vitejs/plugin-react',
      'eslint',
      'happy-dom',
      'typescript',
      'vite',
      'vite-plugin-checker',
      'vite-plugin-svgr',
      'vite-plugin-top-level-await',
      'vitest',
    ],
  },
  tsconfig: {
    extends: '@xylabs/tsconfig-react',
    compilerOptions: { noEmit: true },
  },
  scripts: {
    dev: 'vite',
    build: 'tsc --noEmit && vite build',
    preview: 'vite preview',
  },
  files: [
    { src: 'eslint.config.mjs', dest: 'eslint.config.mjs' },
    { src: 'vite.config.ts', dest: 'vite.config.ts' },
    { src: 'vitest.config.ts', dest: 'vitest.config.ts' },
    { src: 'index.html', dest: 'index.html' },
    { src: 'src/main.tsx', dest: 'src/main.tsx' },
    { src: 'src/App.tsx', dest: 'src/App.tsx' },
    { src: 'src/vite-env.d.ts', dest: 'src/vite-env.d.ts' },
  ],
  nextSteps: ['pnpm dev'],
}
