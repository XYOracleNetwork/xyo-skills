# Skills sync setup: xl1-skills → xyo-skills

This repo auto-publishes its skills to [`XYOracleNetwork/xyo-skills`](https://github.com/XYOracleNetwork/xyo-skills) so they're installable via the `skills.sh` CLI (`npx skills add XYOracleNetwork/xyo-skills`). The sync is driven by three workflows:

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `.github/workflows/sync-skills.yml` | Push to `main` touching `skills/**`, or manual dispatch | Validate, mirror, push to `xyo-skills` |
| `.github/workflows/validate-skills.yml` | PR touching the skills tree | Catch malformed frontmatter before merge |
| `.github/workflows/pat-health.yml` | Monthly cron + manual dispatch | Detect expired/revoked sync PAT and open a tracking issue |

The sync uses plain `git` + `rsync` — no third-party action holds the write-credentialed PAT.

### Multi-source safe

The sync is designed so multiple source repos can publish into the same target. Each source claims its skills via a manifest at `xyo-skills/.sync-manifests/<source-name>.json`. Per-skill `rsync` ensures one source can't clobber another. A collision check fails the workflow if this source tries to publish a skill name another source already owns. See [Onboarding a second source repo](#onboarding-a-second-source-repo) below.

## One-time setup

### 1. Create the fine-grained PAT

Use a fine-grained PAT scoped to only the target repo. Classic `repo`-scoped tokens grant access to every private repo the owner can see and are rejected here for blast-radius reasons.

1. Go to https://github.com/settings/personal-access-tokens/new (Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token).
2. **Token name**: `xl1-skills sync to xyo-skills`.
3. **Resource owner**: `XYOracleNetwork`.
4. **Repository access**: "Only select repositories" → pick `xyo-skills` only.
5. **Repository permissions**: set **Contents: Read and write**. Leave everything else as "No access".
6. **Expiration**: 1 year (the maximum). Record the expiry date in a shared calendar — `pat-health.yml` is the safety net, but the calendar reminder is the primary signal.
7. Generate, copy the token (you only see it once).

### 2. Store the PAT as a repo secret

In **this** repo (`xl1-skills`):

1. Settings → Secrets and variables → Actions → New repository secret.
2. **Name**: `PUBLIC_REPO_SYNC_TOKEN` (exactly).
3. **Secret**: paste the PAT from step 1.
4. Save.

### 3. Seed the target repo

The target repo (`XYOracleNetwork/xyo-skills`) already exists. The sync workflow only writes inside `skills/` and `.sync-manifests/`, so `README.md` and `LICENSE` at the target root need a one-time manual seed.

- **`README.md`** — content is the public face of the repo and is unrelated to sync mechanics. Whatever describes the available skills and how to install them via `skills.sh` is appropriate.
- **`LICENSE`** — should match the source repo (LGPL v3). The simplest path from a local working copy of both repos:

```sh
cp ../xl1-skills/LICENSE.txt LICENSE
git add LICENSE && git commit -m "chore: add LGPL v3 license"
```

The sync workflow never touches `README.md` or `LICENSE` at the target root, so these files are stable and safe to edit independently of the source repo.

## End-to-end first-run test

Run these in order before relying on the auto-sync. Each step confirms a specific behavior — don't skip.

1. **Confirm secret + target.** From this repo's Actions tab, manually trigger `PAT health check` (`workflow_dispatch`). It should report `PAT OK (HTTP 200)`. If it opens an issue, the PAT/secret is misconfigured — fix before continuing.

2. **Confirm validator locally.** From this repo root:
   ```sh
   node scripts/validate-skills.mjs skills
   ```
   Expect: `validated 6 skill(s) in ...`.

3. **Confirm validator catches bad input.** Temporarily create `skills/bad/SKILL.md` with frontmatter missing `description`. Re-run the validator. Expect non-zero exit with a `::error file=...,line=N::frontmatter missing required field: description` annotation. Delete the bad skill.

4. **Dry-run the sync.** From this repo's Actions tab → `Sync skills to xyo-skills` → "Run workflow", check `dry_run: true`, run against branch `main`. Expect logs ending in `dry_run=true — would push the staged diff above to XYOracleNetwork/xyo-skills, but skipping.` Confirm the diff stat shows all six skills being added (the target's `skills/` is currently empty).

5. **First real sync.** Re-run the same workflow with `dry_run: false`. Verify on `XYOracleNetwork/xyo-skills`:
   - One new commit appears on `main`, authored by `github-actions[bot]`, message `chore: sync skills from xl1-skills@<sha>`.
   - `skills/` now contains all six skill directories.
   - `.sync-manifests/xl1-skills.json` exists at the repo root with `{"source":"xl1-skills","skills":[...]}` listing all six skills.
   - `README.md` and `LICENSE` at the target root are unchanged.

6. **Confirm CLI discovery.**
   ```sh
   npx skills add XYOracleNetwork/xyo-skills --skill xl1-scaffold
   ```
   The CLI should resolve the repo, find the skill, and install it.

7. **Confirm idempotency.** Re-run the sync workflow (with `dry_run: false`) without changing anything in the source. Expect logs ending in `No changes to sync.` and no new commit on the target. (Verified locally — manifest is byte-for-byte stable when the owned set doesn't change.)

8. **Confirm path-filter precision.** Push a commit to `main` that only touches a path outside the filter (e.g. `packages/xl1-scaffold/src/...`). Verify `Sync skills to xyo-skills` does **not** run.

9. **Confirm deletion sync.** Rename a skill locally on a throwaway branch — e.g. `git mv skills/xy-toolchain skills/xy-toolchain-renamed` (be sure to update the frontmatter `name:` to match the new directory). PR → merge through your normal flow → push to `main`. The next sync should remove `skills/xy-toolchain/` and add `skills/xy-toolchain-renamed/` in a single commit on the target, with the manifest's `skills` array updated to reflect the rename. **Revert the rename** before continuing if this was a throwaway test.

## PAT rotation

Fine-grained PATs cap at 1 year. The flow:

1. `pat-health.yml` runs monthly. When the PAT is within ~30 days of expiry GitHub starts sending email warnings to the token owner; rotate then. If the PAT actually expires or is revoked, `pat-health.yml` opens an issue on its next run.
2. Repeat steps 1 and 2 of "One-time setup" above to mint and store a new PAT.
3. From the Actions tab, re-run `PAT health check`. Confirm green.
4. Close the tracking issue (if one was opened).

## Curating the mirror

By default every top-level directory under `skills/` gets mirrored. To exclude one (e.g., keep `xy-toolchain` internal), filter inside the `for d in "${SOURCE_DIR}"/*/` loop in `scripts/sync-skills.sh`:

```bash
CURRENT=()
for d in "${SOURCE_DIR}"/*/; do
  name=$(basename "${d}")
  case "${name}" in
    xy-toolchain) continue ;;   # keep internal
  esac
  CURRENT+=("${name}")
done
```

When a skill stops being published, the next sync removes it from the target (the script compares against the previous manifest and rm's the dropped entries). To re-include later, drop the `case` arm and re-sync.

## How the multi-source sync works

The script in `scripts/sync-skills.sh` is the canonical reference. Summary of its algorithm:

1. **Enumerate** the source's top-level skill directories into a `CURRENT` set.
2. **Read** the previous manifest at `<target>/.sync-manifests/<source-name>.json` (may not exist on first sync) into a `PREVIOUS` set.
3. **Collision-check** against every other manifest in `.sync-manifests/`. Fail if any other source already claims a name in `CURRENT`.
4. **Remove** target subtrees in `PREVIOUS \ CURRENT` (skills this source previously owned but no longer does).
5. **Mirror** each name in `CURRENT` via per-skill `rsync -a --delete --safe-links`. The per-skill scope ensures `--delete` only touches that skill's subtree — other sources' skills are untouched.
6. **Write** the new manifest. The manifest contains only `{source, skills}` (no timestamp, no source SHA) so it's byte-for-byte deterministic — re-syncs without ownership changes produce zero git diff. Audit info (when did this last change? at what source SHA?) is recoverable via `git log -p` on the manifest file.

## Onboarding a second source repo

To publish skills from a different repo into `xyo-skills` alongside this one:

1. **Copy the sync infrastructure** to the new source repo:
   - `.github/workflows/sync-skills.yml`
   - `.github/workflows/validate-skills.yml`
   - `.github/workflows/pat-health.yml`
   - `scripts/sync-skills.sh`
   - `scripts/validate-skills.mjs`
2. **Update `env:` in `sync-skills.yml`**:
   - `SOURCE_DIR` — wherever that repo stores its skills tree.
   - `SOURCE_NAME` — unique identifier, lowercase letters/digits/hyphens, must not collide with any existing manifest in `xyo-skills/.sync-manifests/`. Use the source repo's name unless you have a reason not to.
   - `TARGET_REPO` stays the same.
3. **Update the `paths:` filter** under `push.paths` to match the new source's skills tree.
4. **Provision a PAT** for the new source repo (separate from this one). Same fine-grained scope, same secret name (`PUBLIC_REPO_SYNC_TOKEN`). Each source repo holds its own PAT so revoking access to one doesn't break the other.
5. **Confirm skill-name uniqueness** before the first sync. Check the existing manifests in `xyo-skills`:
   ```sh
   gh api repos/XYOracleNetwork/xyo-skills/contents/.sync-manifests --jq '.[].name'
   ```
   For each existing manifest, fetch and inspect the `skills` array. If any name conflicts with what the new source wants to publish, rename on the new source side before proceeding (the workflow will refuse to run otherwise).
6. **Dry-run** the new source's sync workflow (`workflow_dispatch` with `dry_run: true`). Confirm the diff stat shows only that source's skills being added, and no existing skills being modified or deleted.
7. **Real sync.** Verify `xyo-skills/.sync-manifests/<new-source>.json` appears alongside `xl1-skills.json`, and that all skills from both sources coexist under `skills/`.

### Constraints

- **Skill names must not collide** between sources. The collision check fails the workflow if they do, but it's faster to coordinate before pushing.
- **Each source repo must use a unique `SOURCE_NAME`**. Two sources using the same name would overwrite each other's manifest and break the ownership tracking.
- **Concurrent sync runs from different source repos can race the target push.** The within-repo `concurrency: sync-skills` group only serializes within one source. Across sources, the GitHub-side push will reject one of two simultaneous pushes; the rejected run fails and must be re-triggered. In practice, only one source repo merges to its main at a time, so this is rare.

### Removing a source

To stop a source repo from publishing:

1. In `xyo-skills` directly: delete `.sync-manifests/<source-name>.json` and the skill directories listed in that manifest, in a single commit.
2. In the source repo: disable or remove `sync-skills.yml`.

This is one-way; if you want to re-onboard the same source later, follow the onboarding steps again — the missing manifest means it's treated as a first-time sync.

## Upgrade path: GitHub App

When team size grows past one maintainer, replace the PAT with a [GitHub App](https://docs.github.com/en/apps/creating-github-apps) installed on `XYOracleNetwork/xyo-skills` with `Contents: Write`. Mint a per-run installation token with [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token) and pass it as the `PAT` env in the sync workflow. Benefits: tokens are short-lived (1 hour), tied to the App's installation rather than a user account, and survive personnel changes.

For a single-maintainer flow the fine-grained PAT is fine.
