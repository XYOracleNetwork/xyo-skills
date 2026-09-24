---
type: llm
weight: 2
---

The user wants to use ethers.js and `eth_getBalance` against XL1 because the
addresses look like Ethereum addresses.

PASS if the answer says XL1 is not an EVM chain, that Ethereum RPC methods and
SDKs (ethers, viem, web3.js) do not work against it, and shows or points to the
XL1 SDK way to read a balance. Noting that address compatibility comes only from
shared BIP44 derivation is a good sign but not required.

FAIL if the answer provides ethers.js or `eth_*` code against XL1 as something
that would work, or treats the address similarity as evidence of RPC
compatibility.
