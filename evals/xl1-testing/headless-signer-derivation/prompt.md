---
description: The headless signer must be derived canonically and the runner built write-capable; three anti-patterns in one prompt.
tags: [smoke, fidelity, adversarial, xl1-testing]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

My verification script creates the signer with `Account.create({ mnemonic })`,
builds the gateway with `new GatewayBuilder().name('sequence').build()`, and
then calls `addPayloadsToChain` on it. It keeps failing and the address doesn't
match what MetaMask shows for the same seed. What am I doing wrong?
