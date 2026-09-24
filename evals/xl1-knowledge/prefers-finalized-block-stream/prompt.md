---
description: An indexer built on the deprecated headUpdated event must be steered to FinalizedBlockStream, with the wiring shown.
tags: [smoke, fidelity, xl1-knowledge]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

My XL1 indexer currently subscribes to the gateway's `headUpdated` event and
processes each block as it arrives. Rewrite that for me against whatever the
correct API is: show how I obtain the stream from a gateway I've already built
with `GatewayBuilder`, how I iterate it, and what changes about which blocks I
see compared to `headUpdated`.
