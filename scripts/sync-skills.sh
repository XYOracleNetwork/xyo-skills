#!/usr/bin/env bash
# Manifest-driven, multi-source-safe skills sync.
#
# Each source repo that publishes into the target mirror owns a manifest at
# ${TARGET_DIR}/.sync-manifests/${SOURCE_NAME}.json listing the skill
# directory names it controls. Per-skill rsync with --delete only touches
# subtrees this source owns, so multiple sources can publish into the same
# skills/ tree as long as their skill names don't collide.
#
# Required env:
#   SOURCE_DIR  — relative or absolute path to the source's skills tree
#                 (e.g., "skills")
#   SOURCE_NAME — unique identifier for this source; appears in the manifest
#                 filename. Must match ^[a-z0-9][a-z0-9-]*$.
#   TARGET_DIR  — path to the target repo's working copy (must already exist
#                 and be a clean checkout)
# Optional env:
#   GITHUB_SHA  — recorded in the manifest as sourceSha for traceability

set -euo pipefail
shopt -s nullglob

: "${SOURCE_DIR:?SOURCE_DIR must be set}"
: "${SOURCE_NAME:?SOURCE_NAME must be set}"
: "${TARGET_DIR:?TARGET_DIR must be set}"
GITHUB_SHA="${GITHUB_SHA:-}"

if [[ ! "${SOURCE_NAME}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "::error::SOURCE_NAME '${SOURCE_NAME}' must match ^[a-z0-9][a-z0-9-]*$" >&2
  exit 1
fi
if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "::error::SOURCE_DIR '${SOURCE_DIR}' does not exist" >&2
  exit 1
fi
if [[ ! -d "${TARGET_DIR}" ]]; then
  echo "::error::TARGET_DIR '${TARGET_DIR}' does not exist" >&2
  exit 1
fi

MANIFEST_DIR="${TARGET_DIR}/.sync-manifests"
MANIFEST="${MANIFEST_DIR}/${SOURCE_NAME}.json"
mkdir -p "${MANIFEST_DIR}" "${TARGET_DIR}/skills"

# 1. Enumerate currently-owned skill names from the source (top-level dirs only,
#    no hidden entries).
CURRENT=()
for d in "${SOURCE_DIR}"/*/; do
  CURRENT+=("$(basename "${d}")")
done
if [[ ${#CURRENT[@]} -eq 0 ]]; then
  echo "::error::no skill directories found under ${SOURCE_DIR}; refusing to proceed" >&2
  exit 1
fi
# Sort the array deterministically without relying on bash 4+ mapfile.
SORTED=()
while IFS= read -r line; do
  SORTED+=("${line}")
done < <(printf '%s\n' "${CURRENT[@]}" | sort -u)
CURRENT=("${SORTED[@]}")
unset SORTED

echo "Source '${SOURCE_NAME}' currently owns ${#CURRENT[@]} skill(s): ${CURRENT[*]}"

# 2. Read previous manifest, if any. Missing file is normal on first sync.
PREVIOUS=()
if [[ -f "${MANIFEST}" ]]; then
  if ! jq empty "${MANIFEST}" >/dev/null 2>&1; then
    echo "::error file=${MANIFEST}::existing manifest is not valid JSON; refusing to proceed" >&2
    exit 1
  fi
  while IFS= read -r line; do
    [[ -n "${line}" ]] && PREVIOUS+=("${line}")
  done < <(jq -r '.skills[]?' "${MANIFEST}")
fi
echo "Previously owned: ${PREVIOUS[*]:-(none)}"

# 3. Collision check: ensure no OTHER source manifest claims a name in CURRENT.
for other in "${MANIFEST_DIR}"/*.json; do
  [[ "${other}" == "${MANIFEST}" ]] && continue
  if ! jq empty "${other}" >/dev/null 2>&1; then
    echo "::warning file=${other}::sibling manifest is invalid JSON; skipping collision check for this file"
    continue
  fi
  other_source=$(jq -r '.source // "(unknown)"' "${other}")
  other_skills=()
  while IFS= read -r line; do
    [[ -n "${line}" ]] && other_skills+=("${line}")
  done < <(jq -r '.skills[]?' "${other}")
  if [[ ${#other_skills[@]} -eq 0 ]]; then
    continue
  fi
  for s in "${CURRENT[@]}"; do
    for o in "${other_skills[@]}"; do
      if [[ "${s}" == "${o}" ]]; then
        echo "::error::skill name collision: source '${SOURCE_NAME}' wants to publish '${s}', already owned by source '${other_source}' (${other})" >&2
        exit 1
      fi
    done
  done
done

# 4. Remove skills this source previously owned but no longer does.
if [[ ${#PREVIOUS[@]} -gt 0 ]]; then
  for prev in "${PREVIOUS[@]}"; do
    found=0
    for cur in "${CURRENT[@]}"; do
      [[ "${cur}" == "${prev}" ]] && { found=1; break; }
    done
    if [[ $found -eq 0 ]]; then
      echo "Removing ${TARGET_DIR}/skills/${prev} (no longer owned by ${SOURCE_NAME})"
      rm -rf "${TARGET_DIR}/skills/${prev}"
    fi
  done
fi

# 5. Mirror each currently-owned skill. Per-skill --delete only affects that
#    skill's subtree, so other sources' skills are untouched.
for cur in "${CURRENT[@]}"; do
  mkdir -p "${TARGET_DIR}/skills/${cur}"
  rsync -a --delete --safe-links \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='node_modules' \
    "${SOURCE_DIR}/${cur}/" \
    "${TARGET_DIR}/skills/${cur}/"
done

# 6. Write the manifest. Deterministic by content: same owned set → byte-for-byte
#    identical manifest, so re-syncs without source changes produce no git diff.
#    Audit info (when did this last change? at what source SHA?) is recoverable
#    from `git log -p .sync-manifests/${SOURCE_NAME}.json` on the target repo.
SKILLS_JSON=$(printf '%s\n' "${CURRENT[@]}" | jq -R . | jq -s .)
jq -n --sort-keys \
  --arg source "${SOURCE_NAME}" \
  --argjson skills "${SKILLS_JSON}" \
  '{source: $source, skills: $skills}' \
  > "${MANIFEST}"

echo "Wrote manifest: ${MANIFEST}"
