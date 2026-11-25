# Published Indexes

Mainnet and Sequence publish indexes over their finalized chain as static JSON in
the **index bucket**:

| Network | Index bucket |
|---------|--------------|
| Mainnet | `https://indexes.mainnet.xyo.space` |
| Sequence | `https://indexes.sequence.xyo.space` |

This is the `indexes.` bucket that `restGatewayConfigFromEndpoint(<REST root>)`
derives (see [Gateway — Networks](gateway.md#networks)). Reach for these indexes
before you walk blocks. They answer in a few requests what a walk answers in
thousands, and every entry names the block it came from, so you can check it
against the chain.

A plain local `xl1 start` publishes none of these families. On a local chain,
use the block walk in
[Chain Data Indexing — Protocol § Via Block Walk](../xl1-patterns/chain-data-indexing-protocol.md#via-block-walk--schema-discovery-from-the-chain).

---

## The Families

| Family | Head object | Answers | Read with |
|--------|-------------|---------|-----------|
| Main index | `head.json` | Block, schema, balance and transfer summaries, finalized stake events, step rewards | `connection.viewer.*` on a REST gateway (`getRestGateway` binds it for you) |
| Payloads | `payloads/head.json` | Where every payload of a schema is: block, carrier, signers, payload hash | `PayloadIndexViewer` from `getRestGatewayLocator(...)`, or `createRestPayloadIndexViewer(indexUrl)` (`@xyo-network/xl1-sdk` 5.10.6 or later). It is not on `connection.viewer` |
| Slash | `slash/v1/head.json` | Finalized slash requests, commitments, challenges and adjudications, grouped per offense and per accused producer | No SDK reader: path builders and Zod guards from `@xyo-network/xl1-sdk` |
| License | `license/v1/head.json` | The producer license ledger: offerings and licenses, by id, owner and operator | `RestLicenseViewer` (`@xyo-network/chain-sdk/license`) |

Coverage:

- **Payloads** covers both networks from genesis.
- **Slash** and **license** start at a floor block chosen when they rolled out: 781,000 on Sequence and 2,158,000 on Mainnet. Slash and license traffic before its floor is not indexed.

Both SDK readers ship in their packages' platform-neutral builds, not Node-only
ones.

---

## Freshness — Read the Head First

Each family's head says how far it is complete. Never read past it, and never
treat "not there yet" as "does not exist":

| Family | Head field | Normal distance behind the finalized head |
|--------|------------|-------------------------------------------|
| Payloads | `block` (plus `frames`, the completed frame count per step level) | Usually under 10 blocks: it publishes whole 7-block frames, plus the time a pass takes |
| Slash | `height` | 0–1 blocks |
| License | `height` (plus `snapshot`, the content address of the ledger snapshot) | 0–1 blocks |

Compare the head with `viewer.finalization.headNumber()`. If a family stays far
behind for minutes, the index is stalled. Fall back to the chain for blocks
past its head, and do not wait on the index.

---

## Payloads Index — Find Payloads by Schema

The payloads family answers "where is every payload of schema X between blocks
A and B" across the whole chain. A 5,000-block range of a busy schema resolves in
about a second. It replaces scanning every block's `payload_schemas[]` when what
you need is "every payload of this schema".

### What a locator holds

`locators(schema, range)` returns carrier runs. `flattenPayloadLocators(schema,
carriers)` turns them into one record per payload, in canonical order (block,
then carrier, then payload index):

| Field | Meaning |
|-------|---------|
| `block` | Number of the block holding the carrier |
| `carrier` | Hash of the bound witness that commits the payload. For a transaction this is the transaction hash |
| `carrierIndex` | Transaction ordinal within the block. `-1` (`BlockCarrierIndex`) means the block's own `payload_hashes`, and `-2` (`OtherBoundWitnessCarrierIndex`) means another bound witness in the block |
| `payloadIndex` | The payload's position in the carrier's `payload_hashes` |
| `hash` | The payload hash the carrier commits |
| `signers` | The carrier's `addresses` |

The index covers every hash a carrier declares in `payload_schemas[]`. That
includes **off-chain** (Path A) application payloads, so your own schemas are
indexed with no extra work. The index records **where** a payload is, not its
body. Fetch off-chain bodies from the datalake by hash, then validate them with
your Zod guards, because the schema key is only what the carrier declared.

### Recipe

With `@xyo-network/xl1-sdk` 5.10.6 or later, the REST gateway's locator binds
`PayloadIndexViewer` to the network's index bucket. `getRestGatewayLocator`
takes the same config as `getRestGateway` and returns that locator, so one
call gives you both the gateway and the index. When you need only the index,
for example in a React dApp that already gets its gateway from
`InPageGatewaysProvider`, use `createRestPayloadIndexViewer(indexUrl)`:

```ts
import type { PayloadIndexViewer, XyoGateway } from '@xyo-network/xl1-sdk'
import {
  asXL1BlockRange,
  createRestPayloadIndexViewer,
  flattenPayloadLocators,
  getRestGatewayLocator,
  PayloadIndexViewerMoniker,
  XyoGatewayMoniker,
} from '@xyo-network/xl1-sdk'

// A gateway and the payloads index from one locator (same config as getRestGateway)
const locator = await getRestGatewayLocator('https://sequence.xyo.space')
const gateway = await locator.getInstance<XyoGateway>(XyoGatewayMoniker)
const payloadIndex = await locator.getInstance<PayloadIndexViewer>(PayloadIndexViewerMoniker)

// Or the index alone, from the index bucket URL
const indexOnly = await createRestPayloadIndexViewer('https://indexes.sequence.xyo.space')

const watermark = await payloadIndex.watermark()
if (!watermark) throw new Error('The payloads index has not published yet')

// locators() rejects a range that ends past the watermark — clamp to it
const end = Math.min(wantedEnd, watermark.block)
const carriers = await payloadIndex.locators(MoveSchema, asXL1BlockRange([floorBlock, end], true))
const locators = flattenPayloadLocators(MoveSchema, carriers)

// The index says where; the datalake holds the off-chain bodies
const moves = (await datalakeViewer.get(locators.map(locator => locator.hash))).filter(isMovePayload)
// Blocks after watermark.block are not indexed yet: read them from the chain
```

Construct the reader once and reuse it. It caches frame summaries and pages,
which never change, and re-reads only the watermark.

**On xl1-sdk 5.9.0 to 5.10.5**, neither helper exists, and the REST gateway
cannot resolve `PayloadIndexViewer`. Asking it fails with
`MissingCapabilityError: … (no candidates registered)`. Upgrade if you can.
Otherwise call `locatorFromAdaptedConfig` and pass
`providerCandidateFromClass(RestPayloadIndexViewer)` as its only candidate. Import
the class from `@xyo-network/xl1-sdk/rest-block-viewer`. Bind
`PayloadIndexViewer` to a `rest` connection whose `baseUrl` is the index bucket.
The License Index recipe below has the same shape.

For anything after `watermark.block`, read the chain directly: walk
`blockByNumber`, or follow a
[`FinalizedBlockStream`](gateway.md#finalized-block-stream) with `after` set to
the watermark block's hash.

### Trust

The reader rehashes every page against its content address and every frame
summary against its own `_dataHash`. A tampered object therefore fails to load,
but the publisher could still **leave a payload out**. Use the index as the
speed layer, and keep the chain as the truth:

- For a UI feed, a search or a backfill you will re-check, trust the locators as they are.
- For state that moves value or decides an outcome, use the locators to pick which blocks to read, then confirm each carrier in its block (`viewer.block.blockByNumber(locator.block)`). This **index-guided walk** reads only the blocks that hold your schema.
- For authorship, read `from` from the transaction (`viewer.transaction.byHash(locator.carrier)`). `signers` lists every address that signed the carrier, and `from` is only one of them. See [Chain — `from` is the author](chain.md#from-is-the-author).

### Lower-level reads

- `frameSummary(stepLevel, stepIndex)` returns one completed frame's summary. Its `schemas` keys list every schema that appeared in the frame, and `carriers` gives exact counts of blocks, transactions and other bound witnesses. It is useful for a schema inventory or an activity histogram without fetching locators.
- `page(hash)` fetches one verified page of locators.

Frame sizes follow the chain's step sizes. Use `locators()` unless you need
those per-frame views: it already handles inline, paged and delegated entries.

**Name collision:** the `PayloadLocator` **class** exported by `@xyo-network/xl1-sdk`
is the unrelated multi-datalake body fetcher (see [Datalakes](datalakes.md)). The
flattened record above is the `PayloadLocator` **type** from
`@xyo-network/xl1-protocol/protocol-lib`.

---

## Slash Index

The slash family folds finalized slash traffic (requests, commitments,
challenges, adjudications) into one record per offense and one history per
accused producer. Offense classes are the values of `OffenseCodes`:
`equivocation`, `invalid-block`, `reward-overmint`, `false-anchor`,
`ineligible-production`, `invalid-slash-request` and `false-attestation`.
Outcomes are `confirmed`, `refuted`, `indeterminate` and `invalid`.

There is no SDK reader yet. Fetch the static objects with the SDK's path builders
and validate them with its Zod guards. This is a plain read of published files,
not an RPC bypass:

```ts
import type { SlashIndexKeyRecord } from '@xyo-network/xl1-sdk'
import type { XyoAddress } from '@xyo-network/sdk'
import { asXyoAddress } from '@xyo-network/sdk'
import {
  asSlashIndexHead,
  asSlashIndexKeyRecord,
  OffenseCodeZod,
  slashIndexAccusedPath,
  slashIndexHeadPath,
  slashIndexKeyPath,
} from '@xyo-network/xl1-sdk'

async function readIndexJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`Request failed [${response.status}] for ${url}`)
  return await response.json()
}

export async function offensesAgainst(indexUrl: string, producer: XyoAddress) {
  const head = asSlashIndexHead(await readIndexJson(`${indexUrl}/${slashIndexHeadPath()}`), true)
  // No object means nothing is recorded against this producer through head.height
  const accused = await readIndexJson(`${indexUrl}/${slashIndexAccusedPath(producer)}`) as { keys?: string[] } | undefined
  const records: SlashIndexKeyRecord[] = []
  for (const key of accused?.keys ?? []) {
    // Offense key: `${chain}|${accused}|${offense}|${block}`
    const [, address, offense, block] = key.split('|')
    const path = slashIndexKeyPath(asXyoAddress(address, true), OffenseCodeZod.parse(offense), Number(block))
    records.push(asSlashIndexKeyRecord(await readIndexJson(`${indexUrl}/${path}`), true))
  }
  return { height: head.height, records }
}
```

Each `SlashIndexKeyRecord` lists the report hashes (`requests`, earliest first)
and `challenges`, plus the `adjudication` and `outcome` once one is finalized.
The individual payloads live at `slash/v1/{requests,commits,challenges,adjudications}/by-hash/<hash>.json`
(builders `slashIndexRequestPath`, `slashIndexCommitPath`,
`slashIndexChallengePath`, `slashIndexAdjudicationPath`).

The published layout cannot list objects, so the per-producer `accused` history
and the per-offense keys are the only way to discover records. A missing
`accused` object is a clean record only up to `head.height`. Use this index for
explorers, dashboards and operator tooling. A verifier that decides
consequences derives its verdict from the finalized chain.

---

## License Index

The license family republishes the producer license ledger, that is the
offerings and the licenses issued against them, as content-addressed snapshots.
`RestLicenseViewer` reads them. It lives in `@xyo-network/chain-sdk`, which
the REST gateway's locator does not register, so name it as the only
candidate of a small locator:

```ts
import type { XyoAddress } from '@xyo-network/sdk'
import { LicenseViewerMoniker, RestLicenseViewer } from '@xyo-network/chain-sdk/license'
import { locatorFromAdaptedConfig, providerCandidateFromClass } from '@xyo-network/xl1-sdk'

export async function ownedLicenses(indexUrl: string, owner: XyoAddress) {
  const locator = locatorFromAdaptedConfig({
    candidates: [providerCandidateFromClass(RestLicenseViewer)],
    config: {
      connections: { 'rest-index': { baseUrl: indexUrl, type: 'rest' } },
      name: 'license-reader',
      providerBindings: { LicenseViewer: { connection: 'rest-index' } },
    },
    context: { caches: {}, singletons: {} },
  })
  const licenses = await locator.getInstance<RestLicenseViewer>(LicenseViewerMoniker)
  // Reads answer from the last snapshot sync() accepted — the ledger is empty until the first sync
  const head = await licenses.sync()
  return { head, owned: licenses.licensesByOwner(owner) }
}
```

- **Call `sync()` before reading, and again to refresh.** Each call polls the head and fetches a snapshot only when the head names a new one. A snapshot is accepted only when its records hash to the address the head gives.
- **Pass the concrete class to `getInstance<…>()`.** The `LicenseViewer` interface is not a `Provider`, so `getInstance<LicenseViewer>` does not type-check.
- The other reads are `license(id)`, `offering(id)`, `licensesByOperator(address)`, `licensingOperatorAt(address, height, policy)` and `ledger()`.
- **An empty ledger with a current head is a real answer:** no offering or license has been issued yet. It does not mean the index is broken.

The finalizer's license gate folds its own ledger from the chain. This index is
for wallets, explorers, marketplaces and operator tools.

---

## Anti-Patterns

- **Walking every block on Mainnet or Sequence to find payloads of one schema.** Ask the payloads index, then walk only the tail past its watermark.
- **Fetching `payloads/*.json` by hand.** You skip the hash checks and the inline, paged and delegated entry logic. Use `RestPayloadIndexViewer`.
- **Hand-building a payloads locator on xl1-sdk 5.10.6 or later.** Use `getRestGatewayLocator` or `createRestPayloadIndexViewer`.
- **Looking for `PayloadIndexViewer` on `gateway.connection.viewer`.** It is not there. Resolve it from the locator.
- **Reading past a family's head, or treating its lag as absence.** Clamp to the head, and fill the gap from the chain.
- **Taking `signers[0]` as the author.** Read `from` from the transaction.
- **Treating a missing `accused` object as a clean record** without checking the slash head height.
- **Expecting these families on a plain local chain.** Use the block walk there.
