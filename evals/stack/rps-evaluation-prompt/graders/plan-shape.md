---
type: llm
weight: 1
---

The user asked for a plan for a two-player rock-paper-scissors dApp on XL1 with
commit-reveal, on-chain moves and outcomes, wallet-less browsing of past games,
and wallet-connected play.

PASS if the plan includes all four of:
  1. a two-phase commit-reveal in which the commit is a hash of the move plus a
     secret salt and the reveal publishes both for verification;
  2. moves and outcomes recorded on-chain as payloads;
  3. a way for anonymous visitors to browse past games without a wallet — an
     indexer service and/or an in-page (wallet-less) gateway or datalake;
  4. a full-stack shape with a backend service (a monorepo with app, service,
     and shared packages, or an equivalent with a long-running indexer), since
     reveals and settlement happen after the browser may have closed.

FAIL if any of the four is missing, if it proposes raw JSON-RPC or Ethereum
tooling, or if the second player could learn the first player's move before
both have committed.
