#!/usr/bin/env bash
# Seeds the workspace with an existing XL1 project so the scaffold's own
# exclusion criterion — "cwd already has a package.json depending on
# @xyo-network/*" — is what the run exercises.
set -euo pipefail
cat > package.json <<'JSON'
{
  "name": "acme-rps",
  "private": true,
  "type": "module",
  "dependencies": {
    "@xyo-network/xl1-sdk": "^5.0.0",
    "@xyo-network/xl1-react-client-sdk": "^5.0.0",
    "react": "^19.0.0"
  }
}
JSON
mkdir -p src/pages
printf '// existing app entry\nexport {}\n' > src/main.tsx
printf '// game board page\nexport {}\n' > src/pages/Game.tsx
