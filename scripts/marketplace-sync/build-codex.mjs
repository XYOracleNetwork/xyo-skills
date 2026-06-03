#!/usr/bin/env node
import { runRenderer } from './lib.mjs';

await runRenderer({
  name: 'Codex',
  managedPaths: ['skills', 'assets', 'LICENSE', '.agents', '.codex-plugin'],
  generate: ({ metadata }) => ({
    '.agents/plugins/marketplace.json': {
      name: metadata.name,
      interface: {
        displayName: metadata.displayName,
      },
      plugins: [
        {
          name: metadata.name,
          source: { source: 'local', path: './' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: metadata.category.display,
        },
      ],
    },
    '.codex-plugin/plugin.json': {
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      author: metadata.author,
      homepage: metadata.homepage,
      repository: metadata.repository,
      license: metadata.license,
      keywords: metadata.keywords,
      skills: './skills/',
      interface: {
        displayName: metadata.displayName,
        shortDescription: metadata.shortDescription,
        longDescription: metadata.longDescription,
        developerName: metadata.author.name,
        category: metadata.category.display,
        capabilities: metadata.capabilities,
        websiteURL: metadata.homepage,
        defaultPrompt: metadata.defaultPrompts,
        brandColor: metadata.brandColor,
        composerIcon: metadata.icon,
        logo: metadata.logo,
      },
    },
  }),
});
