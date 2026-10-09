import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRedirectStub, parseMetadata } from '../skill-layers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const USAGE = `\
Usage: <renderer> --out <dir> [--source <repo-root>] [--version <vX.Y.Z>]

Options:
  --out       Output directory for the rendered marketplace tree (required).
  --source    Source repo root (default: this checkout).
  --version   Override the version baked into manifests (default: metadata.json).
  -h, --help  Show this message.`;

function parseArgs(argv) {
  const args = { out: null, source: null, version: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--out': args.out = argv[++i]; break;
      case '--source': args.source = argv[++i]; break;
      case '--version': args.version = argv[++i]; break;
      case '-h':
      case '--help':
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }
  if (!args.out) throw new Error(`--out is required\n\n${USAGE}`);
  return args;
}

async function loadMetadata(sourceRoot, versionOverride) {
  const file = path.join(sourceRoot, 'scripts/marketplace-sync/metadata.json');
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  if (versionOverride) raw.version = versionOverride.replace(/^v/, '');
  return raw;
}

async function resetManaged(outDir, managedPaths) {
  await fs.mkdir(outDir, { recursive: true });
  for (const p of managedPaths) {
    await fs.rm(path.join(outDir, p), { recursive: true, force: true });
  }
}

async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + '\n');
}

// Redirect stubs (`metadata.status: redirect` or `metadata.internal: true` in
// SKILL.md) exist only so older Skills.sh installs keep resolving. Their
// canonical copies ship in ariestools-skills' own plugins, so the Claude and
// Codex trees omit them; validate-plugins.yml asserts that.
async function listRedirectStubs(skillsDir) {
  const stubs = [];
  for (const entry of await fs.readdir(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let content;
    try {
      content = await fs.readFile(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    if (isRedirectStub(parseMetadata(content))) stubs.push(entry.name);
  }
  return stubs.sort();
}

async function copyStaticTree(sourceRoot, outDir, copies) {
  const skipped = [];
  for (const { from, to, excludeRedirectStubs } of copies) {
    const src = path.join(sourceRoot, from);
    const dest = path.join(outDir, to);
    const stat = await fs.stat(src);
    if (stat.isDirectory()) {
      const stubs = excludeRedirectStubs ? await listRedirectStubs(src) : [];
      const stubDirs = stubs.map((name) => path.join(src, name));
      const filter = (file) => !stubDirs.some((dir) => file === dir || file.startsWith(dir + path.sep));
      await fs.cp(src, dest, { recursive: true, filter });
      skipped.push(...stubs.map((name) => `${from}/${name}`));
    } else {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }
  }
  return skipped;
}

export async function runRenderer({ name, managedPaths, copies, generate }) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const source = args.source ? path.resolve(args.source) : REPO_ROOT;
    const out = path.resolve(args.out);
    const metadata = await loadMetadata(source, args.version);

    await resetManaged(out, managedPaths);
    const skipped = await copyStaticTree(source, out, copies);

    const files = generate({ metadata });
    for (const [relPath, obj] of Object.entries(files)) {
      await writeJson(path.join(out, relPath), obj);
    }

    console.log(`✓ Rendered ${name} marketplace tree`);
    console.log(`  source:    ${source}`);
    console.log(`  out:       ${out}`);
    console.log(`  version:   ${metadata.version}`);
    console.log(`  manifests: ${Object.keys(files).join(', ')}`);
    if (skipped.length > 0) console.log(`  skipped:   ${skipped.join(', ')} (redirect stubs; Skills.sh only)`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
