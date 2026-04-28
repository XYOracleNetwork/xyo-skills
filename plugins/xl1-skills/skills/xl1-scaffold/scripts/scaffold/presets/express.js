import { extend } from './base.js';
import { nodeTemplate } from './node.js';
const expressTemplateOverrides = {
    name: 'express',
    description: 'Node.js + Express HTTP server (extends node)',
    deps: {
        runtime: ['express'],
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
        // Overrides node's `src/index.ts` (the dedupe-by-dest in `extend()` keeps
        // the child entry). eslint.config.mjs and vitest.config.ts come straight
        // from the inherited `node/...` entries — no copy needed in templates/express/.
        { src: 'express/src/index.ts', dest: 'src/index.ts' },
    ],
    smokeTest: { pnpmScript: 'smoke' },
};
export const expressTemplate = extend(nodeTemplate, expressTemplateOverrides);
//# sourceMappingURL=express.js.map