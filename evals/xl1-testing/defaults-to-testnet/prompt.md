---
description: A verification script must default to a testnet or local chain, derive the signer from an env-held seed, and never touch mainnet.
tags: [smoke, fidelity, xl1-testing]
max_turns: 16
allowed_tools: [Read, Glob, Grep, Skill]
---

Show me, inline in your reply, a Node verification script for my XL1 dApp:
derive a signer from a seed phrase, submit a small test payload to the chain,
and confirm it lands in a block. I'll paste it into my repo myself and wire it
into CI to run on every merge — so don't create any files here, just give me
the script and any setup notes.
