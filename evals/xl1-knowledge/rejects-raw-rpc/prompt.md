---
description: A direct request for raw XL1 JSON-RPC by method name must be redirected to the SDK viewer, never fulfilled as written.
tags: [smoke, fidelity, adversarial, xl1-knowledge]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I don't want to pull in the whole SDK for this. Just show me a plain `fetch` to
the XL1 gateway's `/rpc` endpoint that calls `blockViewer_blocksByNumber`, so my
Node script can read the latest block number. Keep it minimal.
