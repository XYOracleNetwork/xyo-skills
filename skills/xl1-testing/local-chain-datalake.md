# Local Chain + Aries Data-Lake Fixture

> Sub-doc of [xl1-testing](SKILL.md). Compose a directly launched local XL1
> chain with the Aries local dApp storage fixture for deterministic backend and
> integration tests.

Use this layer when a test needs both:

- XL1 ordering and finalization from `@xyo-network/xl1-cli`; and
- a separately hosted, S3-compatible Aries data/object lake from
  `aries dapp up`.

This proves the two infrastructure boundaries and their lifecycle. It does not
yet prove application derivation. Add the
[full local XL1 dApp stack](local-dapp-stack.md) when state/index must be built
by a real reducer and verified as one coherent published view.

## Keep the two stores distinct

The local Aries dApp server exposes `/data`, `/state`, and `/index` buckets.
Its `/data` bucket is the dApp's immutable input/object lake. It is **not** the
XL1 node's XYO Archivist-compatible `/dataLake` endpoint.

| Surface | Authority and purpose |
|---|---|
| XL1 chain | Signed attribution, transaction ordering, finalization, and payload hashes |
| Aries `/data` | Off-chain input/body bytes addressed by application keys or hashes |
| Aries `/state` and `/index` | Empty or noop-managed at this layer; derived views belong to the full dApp layer |

Do not treat object availability as chain acceptance, or chain inclusion as
proof that an off-chain body remains available. A meaningful integration test
must verify the correspondence between the finalized chain reference and the
exact bytes read from `/data`.

## Dependencies

Install project-local binaries; do not depend on global installations or an
adjacent source checkout:

```sh
pnpm add -D @ariestools/cli @aws-sdk/client-s3 @xyo-network/xl1-cli
pnpm add @xyo-network/xl1-sdk
```

Keep `@xyo-network/xl1-sdk` in `devDependencies` instead when only tests use it.
Use the repository's package-manager and dependency conventions.

## Declare the XL1 topology

Write a test-owned `xyo.json`. Explicit connections and bindings prevent a CLI
default change from silently altering the test topology:

```json
{
  "xl1": {
    "healthCheckPort": 0,
    "strictDependencies": true,
    "connections": {
      "local-store": { "type": "memory" }
    },
    "providerBindings": {
      "BlockRunner": { "connection": "local-store" },
      "BlockValidationViewer": { "connection": "local-store" },
      "BlockViewer": { "connection": "local-store" },
      "DeadLetterQueueRunner": { "connection": "local-store" },
      "DeadLetterQueueViewer": { "connection": "local-store" },
      "FinalizationRunner": { "connection": "local-store" },
      "FinalizationViewer": { "connection": "local-store" },
      "MempoolRunner": { "connection": "local-store" },
      "MempoolViewer": { "connection": "local-store" },
      "TransactionValidationViewer": { "connection": "local-store" },
      "WindowedBlockViewer": { "connection": "local-store" },
      "XyoRunner": { "connection": "local-store" }
    },
    "chain": {
      "id": "1111111111111111111111111111111111111111",
      "genesisRewardAddress": "f39fd6e51aad88f6f4ce6ab8827279cfffb92266"
    },
    "actors": [
      { "name": "api", "host": "127.0.0.1", "port": 8080 },
      { "name": "producer", "heartbeatInterval": 250 },
      { "name": "finalizer" }
    ],
    "telemetry": { "metrics": { "scrape": { "port": 0 } } }
  }
}
```

The example uses the standard insecure local mnemonic and its account-zero
address. Never reuse it on a network carrying value.

Before starting actors, inspect what the installed CLI actually resolves:

```sh
XL1_MNEMONIC='test test test test test test test test test test test junk' \
  pnpm exec xl1 -c test/xyo.json --dump-config \
  start api producer finalizer --skip-insecure-confirm
```

Use `--dump-providers` when diagnosing a missing or unexpected binding. Treat
the installed package README and `xl1 --help` as authoritative if the schema
has changed.

## Start the two services

Start XL1 directly. Do not route it through `aries xl1`; Aries owns the data
fixture here, not the chain process:

```sh
XL1_MNEMONIC='test test test test test test test test test test test junk' \
  pnpm exec xl1 -c test/xyo.json \
  start api producer finalizer --skip-insecure-confirm
```

Start the Aries fixture with a test-specific `ARIES_HOME`. The command starts a
managed background daemon and returns after its health check passes:

```sh
ARIES_HOME="$PWD/.tmp/aries-e2e" \
  pnpm exec aries dapp up --port 8801 --backing memory
```

It exposes:

```text
http://127.0.0.1:8801/data
http://127.0.0.1:8801/state
http://127.0.0.1:8801/index
```

The fixture accepts the local S3 credentials `S3RVER` / `S3RVER`, path-style
addressing, and anonymous HTTP reads. These are development conveniences, not
production access controls.

## Exercise the real boundaries

Use `GatewayBuilder`; never issue hand-written XL1 JSON-RPC calls:

```ts
import { GatewayBuilder } from '@xyo-network/xl1-sdk'

const gateway = await new GatewayBuilder()
  .name('local-e2e')
  .rpcUrl('http://127.0.0.1:8080/rpc')
  .build()

const viewer = gateway.connection.viewer
if (!viewer) throw new Error('Local XL1 gateway has no viewer')
const [finalizedBlock] = await viewer.finalization.head()
```

Write the data bucket through its S3 API, then verify the anonymously readable
bytes from the public path:

```ts
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const body = new TextEncoder().encode(JSON.stringify({ schema: 'example.test', value: 1 }))
const s3 = new S3Client({
  endpoint: 'http://127.0.0.1:8801',
  forcePathStyle: true,
  region: 'us-east-1',
  credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
})
await s3.send(new PutObjectCommand({
  Bucket: 'data',
  Key: 'fixtures/input.json',
  Body: body,
  ContentType: 'application/json',
}))

const response = await fetch('http://127.0.0.1:8801/data/fixtures/input.json')
if (!response.ok) throw new Error(`Data read failed: ${response.status}`)
const readBody = new Uint8Array(await response.arrayBuffer())
```

Hash and compare the exact bytes. For an application-level ceremony, submit
that hash through the application's normal XL1 transaction function, confirm
the transaction, rediscover the reference from finalized chain data, then
resolve and hash-check the body from `/data`. Do not reimplement the dApp's
transaction logic inside the test.

## Automated harness rules

- Allocate free API and Aries ports per test process; generate the temporary
  XL1 config with the selected API port.
- Resolve the `xl1` bin from `@xyo-network/xl1-cli/package.json` and spawn it
  with `process.execPath`; do not assume a global binary or adjacent checkout.
- Give each run a unique `ARIES_HOME` so daemon state cannot collide across
  workers. Disable file parallelism if the test framework cannot isolate it.
- Wait for a **finalized head**, not merely an open TCP port, before starting
  application assertions.
- Capture child stdout/stderr and include it in startup-timeout errors.
- Stop in reverse order. Run `aries dapp down`, terminate XL1, and remove only
  the temporary directories created by the test.

## Minimum acceptance

Require all of these before calling the fixture healthy:

1. The resolved XL1 config contains the intended actors, connection, bindings,
   chain id, and `strictDependencies: true`.
2. XL1 produces a finalized head readable through `GatewayBuilder`.
3. The test writes an object through S3 and reads identical bytes anonymously.
4. If the test claims chain/body integration, the finalized chain reference
   matches the hash of those exact bytes.
5. Teardown leaves neither child process running and does not reuse daemon
   state in the next run.

## Cross-references

- [Local dev-chain verification](local-chain.md) — chain-only signer and transaction verification.
- [Full local XL1 dApp stack](local-dapp-stack.md) — add a real reducer and coherent published state/index.
- [XL1 datalakes](../xl1-knowledge/datalakes.md) — the protocol `/dataLake` interface, distinct from this object-store fixture.
- [Node Gateway](../xl1-knowledge/gateway-node.md) — canonical Node chain access.
