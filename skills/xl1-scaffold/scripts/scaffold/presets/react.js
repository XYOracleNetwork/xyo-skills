import { extendBase } from './base.js';
const reactTemplateOverrides = {
    name: 'react',
    description: 'React + Vite + TypeScript XL1 dApp',
    deps: {
        runtime: [
            'react',
            'react-dom',
            '@xyo-network/sdk',
            '@xyo-network/xl1-sdk',
            '@xyo-network/xl1-react-client-sdk',
            '@xyo-network/archivist-storage',
            '@xyo-network/archivist-indexeddb',
        ],
        // Peers-of-peers (emotion is peer of @mui/material) and non-peer extras.
        // The 'events' polyfill covers @metamask/safe-event-emitter's direct
        // import of Node's 'events' module from the wallet postMessage transport.
        // 'ajv' is a peer of @xyo-network/sdk-protocol-core — two levels below
        // @xyo-network/sdk, so expandWithPeers' one-level walk misses it and
        // eslint's transitive ajv@6 would win resolution.
        extras: ['@emotion/react', '@emotion/styled', 'events', 'ajv'],
        // tsconfig-react extends tsconfig-dom extends tsconfig — both extras need
        // to be direct dev deps so the ESLint import resolver can walk the
        // tsconfig extends chain. (`@ariestools/tsconfig` itself comes from base.)
        dev: [
            '@ariestools/tsconfig-dom',
            '@ariestools/tsconfig-react',
            '@ariestools/eslint-config-react-flat',
            '@types/react',
            '@types/react-dom',
            '@vitejs/plugin-react',
            'happy-dom',
            'vite',
            'vite-plugin-checker',
            'vite-plugin-svgr',
        ],
        versions: {
            '@mui/material': '^9',
            '@mui/icons-material': '^9',
            '@react-spring/web': '~10.0',
        },
    },
    tsconfig: {
        extends: '@ariestools/tsconfig-react',
        compilerOptions: { noEmit: true },
    },
    scripts: {
        dev: 'vite',
        build: 'tsc --noEmit && vite build',
        preview: 'vite preview',
    },
    files: [
        { src: 'react/eslint.config.mjs', dest: 'eslint.config.mjs' },
        { src: 'react/vite.config.ts', dest: 'vite.config.ts' },
        { src: 'react/vitest.config.ts', dest: 'vitest.config.ts' },
        { src: 'react/index.html', dest: 'index.html' },
        { src: 'react/_env.example', dest: '.env.example' },
        { src: 'react/src/main.tsx', dest: 'src/main.tsx' },
        { src: 'react/src/App.tsx', dest: 'src/App.tsx' },
        { src: 'react/src/vite-env.d.ts', dest: 'src/vite-env.d.ts' },
    ],
};
export const reactTemplate = extendBase(reactTemplateOverrides);
//# sourceMappingURL=react.js.map