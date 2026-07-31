# Full Local XL1 dApp Stack

> Sub-doc of [xl1-testing](SKILL.md). Extend the
> [local chain + Aries fixture](local-chain-datalake.md) with a project-owned
> finalized-chain source, real `DappReducer`, coherent publication, and
> anonymous consumer verification.

Use this as the local end-to-end backend ceremony for an XL1 dApp that derives
public state or indexes from finalized chain data and/or datalake bodies. It
proves the application composition without requiring a public IP, live network,
or production object store.

## Composition

```text
@xyo-network/xl1-cli
  api + producer + finalizer
            |
            v
GatewayBuilder finalized source ----> project DappReducer
                                           |
                                           v
@ariestools/aries-dapp-core ----> data / state / index stores
                                           |
                                           v
                     @ariestools/aries-dapp-core/consumer
```

Keep authority explicit:

- XL1 supplies signed attribution, ordering, and finality.
- Datalake/object bodies supply content availability, not chain acceptance.
- The reducer supplies a rebuildable interpretation.
- Published state and indexes are derived views, not protocol or identity
  authority.

## Identify the project contracts first

Before building the harness, locate and import the project's actual:

- finalized-chain source/replay adapter;
- transaction/domain function that anchors a body reference;
- canonical serialization and hashing function;
- data object-key convention;
- reducer factory and watermark semantics; and
- published logical keys and schemas.

Do not recreate those behaviors inside the test. Decide explicitly whether the
application body belongs in Aries `/data` or the distinct XL1 `/dataLake` before
composing storage.

## Dependencies

Start with the dependencies in
[local chain + Aries fixture](local-chain-datalake.md), then add:

```sh
pnpm add @ariestools/aries-dapp-core @ariestools/aries-dapp-serve
```

`@ariestools/aries-dapp-serve` is a local fixture dependency. If it is imported
only by test helpers, keep it in `devDependencies`. The project-owned backend
package normally carries `aries-dapp-core` as a runtime dependency.

## Use SDK composition for the full ceremony

Do not run the noop `aries dapp up` daemon for this layer. Start its storage
component programmatically so the test owns the port and lifecycle, then run
the project's real reducer through `aries-dapp-core`:

```ts
import {
  bootDappActors,
  createDappLocator,
} from '@ariestools/aries-dapp-core'
import {
  createMemoryBacking,
  startDappServer,
} from '@ariestools/aries-dapp-serve'

const server = await startDappServer({
  backing: createMemoryBacking(),
  port: 0,
  silent: true,
})

const bases = {
  data: `${server.baseUrl}/data`,
  state: `${server.baseUrl}/state`,
  index: `${server.baseUrl}/index`,
}

const locator = createDappLocator({
  endpoint: server.baseUrl,
  forcePathStyle: true,
  bindings: {
    data: { bucket: 'data', publicBaseUrl: bases.data },
    state: { bucket: 'state', publicBaseUrl: bases.state },
    index: { bucket: 'index', publicBaseUrl: bases.index },
  },
})

// Define the project-owned reducer as shown below, then boot it.
const actors = await bootDappActors(locator, [{
  name: 'LocalIndexer',
  reducer,
  firstRunDelayMs: 0,
  reduceIntervalMs: 500,
  publishStatus: true,
}])
```

`createDappLocator` presents `data` read-only to reducers by default. Retain
that boundary. Ingestion writes data through a separate writer/principal;
reducers write only derived `state` and `index`.

Use the S3 ingestion writer from
[local chain + Aries fixture](local-chain-datalake.md#exercise-the-real-boundaries)
to put the application's exact serialized bytes into `/data`. Compute the
reference with the project's canonical hasher, submit it with the project's
normal XL1 transaction function, and rediscover it from finalized chain data.
Only then boot a reducer that resolves and interprets that input. Assert that a
write attempted through the reducer-facing data store is rejected.

## Build the finalized-chain source through the SDK

Create one `GatewayBuilder` instance and reuse it. Never use raw JSON-RPC
method names:

```ts
import { GatewayBuilder } from '@xyo-network/xl1-sdk'

const gateway = await new GatewayBuilder()
  .name('local-dapp-source')
  .rpcUrl(localRpcUrl)
  .build()

async function readFinalized(signal?: AbortSignal) {
  if (signal?.aborted === true) throw new Error('Finalized read aborted')
  const viewer = gateway.connection.viewer
  if (!viewer) throw new Error('XL1 gateway has no viewer')
  const [block, payloads] = await viewer.finalization.head()
  return {
    chain: String(block.chain),
    hash: block._hash,
    number: Number(block.block),
    payloadCount: payloads.length,
  }
}
```

Wait until this source can read a finalized head before booting the actor. That
turns actor readiness into a reducer/publication assertion rather than a race
with chain startup.

## Publish a coherent generation

Make the reducer idempotent and watermark-driven. Publish immutable state/index
objects and their manifest before advancing `head.json`:

The following reducer proves the publication spine with a finalized-head
checkpoint. It is illustrative, not a substitute for the project's real
reducer. A dApp whose state depends on `/data` must import its real resolution,
schema-validation, and fold logic.

```ts
import {
  publishGeneration,
  type DappReducer,
} from '@ariestools/aries-dapp-core'

const reducer: DappReducer = {
  name: 'local-indexer',
  version: '1',
  async reduce({ state, index, signal }) {
    const finalized = await readFinalized(signal)
    const body = `${JSON.stringify(finalized)}\n`
    const published = await publishGeneration({
      state,
      index,
      safety: { mode: 'unfenced' },
      reducer: { name: 'local-indexer', version: '1' },
      source: {
        cursor: String(finalized.number),
        completedPosition: String(finalized.number),
        observedHead: finalized.hash,
      },
      stateObjects: [{
        key: 'chain.json',
        body,
        contentType: 'application/json',
      }],
      indexObjects: [{
        key: `by-hash/${finalized.hash}.json`,
        body,
        contentType: 'application/json',
      }],
      signal,
    })
    if (!published.ok) {
      throw new Error(`Publication conflict: ${published.conflict.message}`)
    }
    return {
      cursor: String(finalized.number),
      lastCompletedPosition: String(finalized.number),
      observedSourceHead: finalized.hash,
      generation: published.generation,
      generationRoot: published.manifestKey,
    }
  },
}
```

Use `unfenced` only with the single-writer local `s3rver` fixture. Production
must use `conditional-head` with a provider that supports conditional writes,
or an injected lease/fencing implementation.

## Verify as an anonymous client

Do not assert only against reducer internals. Read the public paths through the
browser-neutral consumer and verify the head, manifest, and object hashes:

```ts
import {
  resolveObject,
  verifyPublishedView,
} from '@ariestools/aries-dapp-core/consumer'

const publicBases = { state: bases.state, index: bases.index }
const view = await verifyPublishedView({
  bases: publicBases,
  fetch,
  includeStatus: true,
})

const stateObject = await resolveObject({
  bases: publicBases,
  fetch,
  head: view.head,
  logicalKey: 'chain.json',
  role: 'state',
})
```

Parse and assert the resolved bytes. At minimum, require the published finalized
hash/height to equal the source snapshot and require the durable status
`lastCompletedPosition` to equal the published source position.

Add a negative integrity assertion by wrapping `fetch`, corrupting one byte of
one immutable generation object, and requiring consumer resolution to reject:

```ts
const corruptingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  if (!String(input).includes('/generations/')) return response
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > 0) bytes[0] = (bytes[0] ?? 0) ^ 1
  return new Response(bytes, { headers: response.headers, status: response.status })
}

await expect(resolveObject({
  bases: publicBases,
  fetch: corruptingFetch,
  head: view.head,
  logicalKey: 'chain.json',
  role: 'state',
})).rejects.toThrow()
```

## Test lifecycle

Run one isolated ceremony per test file:

1. Allocate free ports and write a temporary XL1 config with explicit memory
   connection/provider bindings and `strictDependencies: true`.
2. Resolve and spawn the direct `@xyo-network/xl1-cli` bin with `api`,
   `producer`, and `finalizer`; capture output.
3. Wait for `GatewayBuilder` to read a finalized head.
4. Start `@ariestools/aries-dapp-serve` on port `0` with memory backing.
5. Create the locator, real reducer, and actors; allow `bootDappActors` readiness
   to prove the first reduce pass.
6. Verify the public view through `aries-dapp-core/consumer`.
7. Stop actors in reverse order, call `locator.destroy()`, close the server, and
   terminate XL1. Clean only test-owned temporary files.

Make cleanup safe for partial startup:

```ts
try {
  await runAssertions()
} finally {
  for (const actor of [...actors].reverse()) await actor.stop()
  locator?.destroy()
  await server?.close()
  await stopXl1Child(xl1Child)
}
```

Initialize optional handles before `try`, and make `stopXl1Child` send
`SIGTERM`, await a bounded exit, then use `SIGKILL` only if the child does not
stop. Never delete paths that the test did not create.

Prefer a dedicated non-parallel Vitest project for this ceremony. Give startup
and finalization waits bounded timeouts, and include captured child output in
failures.

## Minimum acceptance

Require all of these:

1. Direct XL1 CLI startup uses the intended config and produces a finalized head.
2. The project-owned reducer—not `noopReducer`—runs successfully.
3. The reducer sees `data` as read-only and writes only derived roles.
4. A full published generation has immutable objects, a verified manifest, and
   a head written last.
5. Anonymous consumer verification succeeds and detects body/hash mismatch.
6. Published source cursor/head and durable status agree.
7. A repeated pass is idempotent or advances from an explicit watermark.
8. Teardown succeeds after both passing and failing setup paths.

## What this does not prove

- Sequence/mainnet consensus, latency, fees, staking, or deployment topology.
- Production R2/S3 durability, IAM, CDN behavior, conditional writes, leases,
  or multi-writer conflict handling.
- That derived state is authoritative truth rather than one reproducible fold.
- Browser UX or wallet-extension behavior.

Follow a green local run with
[headless Sequence verification](headless-testnet-verification.md), provider
contract tests where applicable, and browser/full-app tests for user journeys.

## Cross-references

- [Local chain + Aries data-lake fixture](local-chain-datalake.md) — the lower-level infrastructure composition.
- [Local dev-chain verification](local-chain.md) — transaction/signing verification without the dApp backend.
- [Node Gateway](../xl1-knowledge/gateway-node.md) — canonical source construction.
- [Chain data indexing](../xl1-patterns/chain-data-indexing-protocol.md) — finalized replay and index semantics.
- [dApp Definition of Done](../xl1-patterns/dapp-checklist.md) — the broader completion gate.
