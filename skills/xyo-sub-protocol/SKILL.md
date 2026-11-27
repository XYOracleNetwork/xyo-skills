---
name: xyo-sub-protocol
description: >-
  Use when drafting, reviewing, or implementing shared wire and verification
  rules for an XYO sub-protocol on XL1. Covers the single WHITEPAPER.md pattern,
  a worked example, and implementation package boundaries. Chronicle illustrates
  a specification-only repository and Statement Graph an implemented protocol.
metadata:
  version: 1.1.45 # x-release-please-version
  layer: 10
---

# XYO sub-protocols on XL1

**Skill identity.** Report as `xyo-sub-protocol v<version>` from this file's `metadata.version`.

Use this skill when two producers or readers need to agree on the meaning of the same XYO or XL1 evidence. If the repository consumes an existing protocol to build an application, keep its vocabulary, views, storage and deployment decisions with that application. [LifeHash](https://github.com/XYOracleNetwork/lifehash) is a consumer of Statement Graph.

## Skill layers

- **Builds on:** [xyo-knowledge](../xyo-knowledge/SKILL.md) (3) for payloads, hashes and Bound Witnesses, [xl1-knowledge](../xl1-knowledge/SKILL.md) (4) for XL1 transactions, blocks and finality, and [ariestools-skills](https://github.com/ariestools/ariestools-skills) (1–2) for development and toolchain conventions.
- **Hands off to:** none

For an application using existing protocol rules, see [xl1-patterns](../xl1-patterns/SKILL.md). For headless tests of a running implementation, see [xl1-testing](../xl1-testing/SKILL.md).

## What every sub-protocol needs

Put the current normative specification in one root `WHITEPAPER.md`. A reader should be able to derive the result of the worked example using just the paper, the upstream rules it names and any grammar it explicitly incorporates. Use these questions to write or review it.

| Question | What the paper must settle |
|---|---|
| What can a reader conclude? | Identify the roles, the result each can produce or verify, the trust assumptions and the claims the evidence leaves open. |
| Which bytes carry that meaning? | Define the sub-protocol's wire objects and identifiers. Name the upstream rules for hashing, signing and XL1 inclusion that it relies on. Identify what becomes public, what is merely referenced and where a reader obtains the evidence. |
| How do two readers agree? | Specify the inputs, including any expectations supplied by the caller. Give the checks, ordering where it matters, and observable outputs for valid, missing and contradictory evidence. Make the result reproducible for the same inputs. |
| How would someone check conformance? | Name the revision and role being checked. Walk one concrete input through to its expected result. Change one input or remove one piece of evidence and say exactly which conclusion changes. Label modeled inputs and state what has actually been exercised. |

Keep a small root map. `README.md` gives the status, reading order, files that exist and commands that work. `HISTORY.md` records decisions and superseded designs. `AGENTS.md` points contributors to the governing rules and checks. If the repo uses `CLAUDE.md`, point it to `AGENTS.md`. Keep normative rules in the paper or in the grammar it incorporates, with one authority for each rule.

A draft can ship a portable schema in `schemas/` and example data in `examples/` when they make the paper checkable. A short example can live entirely in the paper. When consolidating existing papers, preserve and label the originals as history. A specification-only request can end here. Add packages when implementation starts and leave roadmaps, PRDs and business papers to the products that need them.

## Two examples of the same pattern

**Parallax Chronicle — specification only.** XL1 carries an operator transaction referencing the root hash of a private commitment. The reader verifies disclosed bodies and signed links against that commitment. Chronicle owns its private wire grammar and inherits XYO's Bound Witness format. In the worked disclosure one planner record is produced and one is declared withheld. Remove block 102 from the modeled chain view and the two endpoint inclusions can still be checked, while accounting for every operator transaction in the interval becomes incomplete. The signatures are real and finality is modeled. This is a worked example in a draft with no verifier package. [White paper §6](https://github.com/XYOracleNetwork/chronicle/blob/4b0302a93f32cc88d94e420a00d32247c1546115/WHITEPAPER.md#6-one-worked-disclosure) · [Disclosure and expected observations](https://github.com/XYOracleNetwork/chronicle/blob/4b0302a93f32cc88d94e420a00d32247c1546115/examples/disclosure.json)

**XL1 Statement Graph — implemented.** A transaction elevates the Claim hash, and the reader must obtain the matching Claim body from that same finalized block. A missing or mismatched carrier stops the scan even if a datalake has a copy. The chain-admitted Claim grammar belongs to `@xyo-network/xl1-protocol` and is re-exported by Statement Graph. Statement Graph owns the rules that turn accepted claims into graph records. Its fold fixtures give expected records and rejection outcomes. For example, a valid single-hash Claim materializes one record. If a Claim names several object hashes and one is absent from the transaction, the entire Claim fails the co-commit rule. [Protocol and package map](https://github.com/XYOracleNetwork/xl1-statement-graph/blob/89441665d1a277182f7b5a777a810d92ad60b7ce/README.md) · [Fold vectors](https://github.com/XYOracleNetwork/xl1-statement-graph/blob/89441665d1a277182f7b5a777a810d92ad60b7ce/packages/schemas/fixtures/fold.json)

To choose the grammar's owner, ask what XL1 itself must recognize. If a new XL1 admission rule requires block producers to carry a particular payload type, define its admission grammar upstream. If a transaction only references a privately defined object by hash, its format stays with the protocol that defines it.

## When there is an implementation

Let the code's responsibilities determine the package map. Statement Graph illustrates these boundaries in TypeScript. Introduce each surface when there is code or a consumer for it.

| Surface | What belongs there |
|---|---|
| `schemas` | Shareable wire types, parsers and fixtures. Re-export upstream-owned grammar. A draft JSON schema can become an input to this package. |
| `protocol` | Pure verification or state transitions over explicit inputs. Chronicle would verify a disclosure here. Statement Graph folds claims. Keep chain and storage I/O at the boundary. |
| `sdk` | Writers and readers that obtain or submit evidence through caller-supplied interfaces. Statement Graph uses finalized replay and checkpoints because it reconstructs a graph across blocks. |
| `testing` | Dev-only fakes, fixture builders and scenarios when implementations or adapters need to reuse them. A worked example can become an executable vector by asserting the paper's expected outcome against the code. |
| Optional runtime | Statement Graph's `engine` and `engine-actor` support local sequencing and hosting. Add a runtime only for a concrete execution model. Product indexes, deployed datalakes and application views belong with their consumers. |

Map actual package responsibilities and exclusions in the README. Document the commands the implementation uses. For example, Statement Graph refreshes pinned fixtures through its refresh script, runs its regular tests in Node and Chromium, and invokes its dev-chain suite separately.

Test the guarantees the paper makes. For a reader that promises resumable replay, compare a full scan with a resumed scan over the same evidence, including the availability of optional bodies if that affects the result. Passing one implementation's vectors supports a claim about that implementation. An interoperability claim needs separately written implementations to agree on the same evidence. A live-chain claim needs observations from the identified network.
