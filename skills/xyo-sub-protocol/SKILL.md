---
name: xyo-sub-protocol
description: >-
  Structures a repository that proposes and implements a normative XYO
  sub-protocol on XL1. Use when creating or reviewing an XYO sub-protocol,
  an XL1 protocol repo structure, or the statement graph layout: one root
  spec at WHITEPAPER.md and history at HISTORY.md, both at the repo root, a
  README package allow/deny map, AGENTS.md protocol invariants, and the
  schemas, protocol, sdk, and testing packages. docs/ is outside that
  skeleton. The reference example is xl1-statement-graph; LifeHash is the
  example of a protocol that references a sub-protocol.
metadata:
  version: 1.1.45 # x-release-please-version
  layer: 10
---

# Normative XYO sub-protocol

**Skill identity.** Report as `xyo-sub-protocol v<version>` from this file's `metadata.version`.

Use this skill when a repository's job is a normative XYO sub-protocol on XL1: a closed grammar, pure rules, and a writer/replay SDK that other protocols and deployments consume. The reference implementation is [xl1-statement-graph](https://github.com/XYOracleNetwork/xl1-statement-graph). [LifeHash](https://github.com/XYOracleNetwork/lifehash) is the example of a protocol that references a sub-protocol.

## Skill layers

This is a specialist for protocol repositories. It sits beside the dApp cascade (layers 5–9), which builds products on top of a sub-protocol that already exists.

- **Builds on:** [xyo-knowledge](../xyo-knowledge/SKILL.md) (3) for payloads, schemas, and bound witnesses; [xl1-knowledge](../xl1-knowledge/SKILL.md) (4) for XL1 blocks, gateways, and datalakes; `xy-toolchain` and `xy-development` from [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2)
- **Hands off to:** none

Application features that use an existing sub-protocol, including Statement Graph relationship claims, continue in [xl1-patterns](../xl1-patterns/SKILL.md). A new product repository continues in [xl1-scaffold](../xl1-scaffold/SKILL.md). Headless verification continues in [xl1-testing](../xl1-testing/SKILL.md).

## One spec

Keep one normative spec at `WHITEPAPER.md` in the repo root.

Leave it as one document. Do not split it into `papers/` to mimic a product repo. Product repositories use `papers/` because they have a thesis, an implementation spec, and a business paper. LifeHash keeps white, yellow, and green papers there (plus a light paper). dapp-kit keeps its papers under `papers/` as well. A sub-protocol's spec is the single root document.

Keep the protocol history at `HISTORY.md` in the repo root. It is the decision record. It records rulings. It does not replace the spec.

`docs/` is outside the skeleton. It holds documents the skeleton does not define or control: code reviews, action plans, gate-profile notes, and anything similar. The spec and the history stay at the repo root.

The root skeleton is `README.md`, `WHITEPAPER.md`, `HISTORY.md`, and `AGENTS.md`. `CLAUDE.md` stays a one-line pointer to `AGENTS.md`.

## README and AGENTS.md

The README is the reader-facing contract: reading order, what each package is allowed and not allowed to contain, the monorepo shape, and the toolchain. Keep the license and any normative-decision summary the repo already shows readers. Do not paste the invariant list into the README.

`AGENTS.md` holds protocol invariants and links to the README for layout, allow/deny, and toolchain. `CLAUDE.md` stays a one-line pointer to `AGENTS.md`.

Reading order for a sub-protocol repo:

1. The root spec, `WHITEPAPER.md`.
2. The decision record, `HISTORY.md`, when one exists.
3. Packages, in this order: normative code, reference chain access, optional runtime.
4. What lives in another repository: object bodies in the caller's datalake, deployment frames, and a referencing protocol's own payloads and index.

## Packages

Describe packages as they are. If the code already does something, the allow list includes it. Do not invent a cleaner boundary and then imply the code should move.

### Required

A new sub-protocol copies these four. The Statement Graph packages are the reference shape.

| Package | Allowed | Not allowed |
|---|---|---|
| `schemas` | Grammar, record shapes, the replay contract, conformance fixtures, and guards. Re-export a block-carried payload's NSID and fields from the package that owns them. | The fold. Chain, gateway, datalake, or archivist I/O. A second declaration of an NSID owned upstream. Product vocabulary. |
| `protocol` | Identities, acceptance gates, the normative fold, and pure helpers (including vocabulary-neutral view helpers when the caller supplies the extractor). Content hashing. | Chain, gateway, datalake, or archivist I/O. A concrete block viewer or body store. Product views or a schema-specific fold branch. |
| `sdk` | The verified writer and finalized replay over structural interfaces (`FinalizedBlockViewer`, `BodyStore`, `StatementBroadcaster`, or the equivalent). Checkpoint and resume. Decoding a finalized block's payload shape. | A hard-wired gateway client, datalake client, or archivist implementation. A product index. |
| `testing` | Dev-only fakes, including an in-memory datalake fake, fixture builders, fault injection, and one acceptance scenario whose substrate is a parameter. | A production chain adapter, gateway, datalake deployment, or archivist. Product vocabulary. |

The reference `sdk` calls a caller-supplied body store for object and auxiliary bodies. Elevated payloads that must be proven from a finalized block are verified from that block. A datalake copy is not a fallback for those carriers.

The reference `testing` package also ships a fixture stack and a scenario runner whose caller supplies the action vocabulary. Those are test support. They are not a production adapter.

### Optional runtime

`engine` and `engine-actor` in the reference repo are that substrate's runtime: backing-neutral clocks, lossless state, a mutation sink, incremental application, a viewer, and an actor-hosted local sequence with an insert-first writer. A new sub-protocol does not need them.

A consumer protocol often stops at its own `schemas`, `protocol`, and `sdk`, plus its own indexer. LifeHash does this. It depends on Statement Graph's schemas and protocol, and it publishes LifeHash `schemas`, `protocol`, `sdk`, and `indexer` next to its product packages.

An archivist inside an optional local runtime, when one exists, is the trusted local sequence (or a caller-supplied store the host is explicitly allowed to reuse as a body-store seam). It is not a license to ship an off-chain object datalake.

### Outside the protocol repo

These belong to the deployment, or to the protocol that references this one:

- Product vocabulary and product views.
- A datalake or archivist implementation.
- A product index.
- Generic frames and other deployment composition (in the reference ecosystem, the XL1 Edge-Node Protocol in `xl1-edge-node-api`).

Object bodies stay in the caller's datalake. The sub-protocol repo defines how a caller addresses them. It does not operate the lake.

## Chain admission

When a payload must be carried inside a finalized XL1 block, its grammar is owned by `@xyo-network/xl1-protocol`. The sub-protocol re-exports that grammar. It does not redeclare the NSID.

Statement Graph does this for the Claim. `ClaimSchema` and the Claim field grammar are re-exported from `@xyo-network/xl1-protocol`. A new block-carried payload is added in xl1-protocol first, then re-exported.

Payloads that are not chain-admitted — referenced objects, product records, index rows — keep their grammar in the repository that owns that meaning.

## Toolchain

- pnpm workspace. ESM only. One shared version across the repo's packages. Read it from `packages/*/package.json`. Consumers pin a minor and adopt the next minor explicitly. A tilde range includes later patches on that minor and does not include the next minor.
- `xy` from the repository root (`pnpm xy build` compiles, then runs publint, deplint, and lint).
- One root `vitest.config.ts`. No per-package Vitest config. Specs live under `src/**/spec/`: `spec/` runs in Node and real Chromium, `spec/node/` is Node only, and `spec/browser/` is Chromium only.
- Conformance fixtures change only through the repo's refresh script. A hash pin that fails on an unscripted fixture edit is the intended check.
- The owner publishes. An agent session prepares the release and hands over the command.
- A local dev-chain test, when the repo has one, stays opt-in. Standard test scripts and CI select the `node` and `browser` projects. A bare `vitest run`, or `pnpm xy test`, can select every project and boot a chain. Document that footgun next to the harness.

## Reference layout

[xl1-statement-graph](https://github.com/XYOracleNetwork/xl1-statement-graph):

- `WHITEPAPER.md` — the spec, at the repo root
- `HISTORY.md` — the protocol history and decision record, at the repo root
- `README.md` — reading order, package allow/deny, monorepo and toolchain
- `AGENTS.md` — protocol invariants, with layout pointed at the README
- `docs/` — outside the skeleton: code reviews, action plans, gate-profile notes, and anything similar
- `packages/schemas`, `packages/protocol`, `packages/sdk`, `packages/testing` — the pattern to copy
- `packages/engine`, `packages/engine-actor` — this substrate's runtime

[LifeHash](https://github.com/XYOracleNetwork/lifehash) references that sub-protocol, keeps its own payloads and index, and keeps its thesis, implementation spec, and business paper under `papers/`.
