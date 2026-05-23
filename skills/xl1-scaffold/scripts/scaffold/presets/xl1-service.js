import { extend } from './base.js';
import { nodeTemplate } from './node.js';
const xl1ServiceTemplateOverrides = {
    name: 'xl1-service',
    description: 'XL1 Node.js service with Express HTTP server (extends node)',
    deps: {
        runtime: ['express', '@xyo-network/sdk-js', '@xyo-network/xl1-sdk'],
        dev: ['@types/express'],
        versions: { express: '^5' },
    },
    scripts: {
        // Boots the server, sleeps ~1s, then shuts down cleanly. Used as the
        // smokeTest below — replaces node's `start`-based smoke (which would
        // hang on a listening server).
        smoke: 'node dist/index.js --smoke-test',
    },
    files: [
        // Overrides node's `src/index.ts` and `.env.example` (the dedupe-by-dest in
        // `extend()` keeps the child entry). eslint.config.mjs and vitest.config.ts
        // come straight from the inherited `node/...` entries — no copy needed in
        // templates/xl1-service/.
        { src: 'xl1-service/_env.example', dest: '.env.example' },
        { src: 'xl1-service/src/index.ts', dest: 'src/index.ts' },
    ],
    smokeTest: { pnpmScript: 'smoke' },
};
export const xl1ServiceTemplate = extend(nodeTemplate, xl1ServiceTemplateOverrides);
//# sourceMappingURL=xl1-service.js.map