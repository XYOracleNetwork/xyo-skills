#!/usr/bin/env node
import { runRenderer } from './lib.mjs';

await runRenderer({
  name: 'Claude',
  managedPaths: ['skills', 'assets', 'LICENSE', '.claude-plugin'],
  generate: ({ metadata }) => {
    const pluginEntry = {
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      author: { name: metadata.author.name },
      source: './',
      category: metadata.category.slug,
      tags: metadata.keywords,
      keywords: metadata.keywords,
    };

    return {
      '.claude-plugin/marketplace.json': {
        name: metadata.name,
        owner: metadata.owner,
        metadata: {
          description: metadata.description,
          version: metadata.version,
        },
        plugins: [pluginEntry],
      },
      '.claude-plugin/plugin.json': {
        name: metadata.name,
        version: metadata.version,
        description: metadata.description,
        author: metadata.author,
        homepage: metadata.homepage,
        repository: metadata.repository,
        license: metadata.license,
        keywords: metadata.keywords,
      },
    };
  },
});
