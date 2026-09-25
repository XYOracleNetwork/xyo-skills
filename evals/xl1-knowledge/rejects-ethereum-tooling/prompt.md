---
description: Ethereum SDKs and eth_* methods against XL1 must be refused with the XL1 equivalent, not accommodated.
tags: [smoke, fidelity, adversarial, xl1-knowledge]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

XL1 addresses look exactly like Ethereum addresses, so I'm planning to use
ethers.js and call `eth_getBalance` against the XL1 gateway to read an account
balance. Can you give me that snippet?
