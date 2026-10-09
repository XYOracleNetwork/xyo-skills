# Events and Wakes

Read when the dApp is event-driven or integrates Event Kit.

## Three contracts (do not merge)

| Contract | Owner | Meaning |
|----------|-------|---------|
| **Event Kit wake** | `@xyo-network/event-kit-*` 2.2.x | Wallet-JWT admission + enqueue hint for a finalized XL1, finalized Ethereum, or completed UTC-interval source range |
| **dapp-kit durable event** | `@xyo-network/dapp-kit` / `-events` | Ordered partitioned application-event log + fingerprint / collision rules; identity excludes the per-attempt JWT `jti` |
| **Subscription cursor** | dapp-kit | Independent fence per logical consumer; **at-least-once** delivery |

Exact-once outcomes require **idempotent** consumers, not a stronger wake promise.

## Composition

```text
Statement Graph grants + D-005 handshake
  → Event Kit active-source admission → WakeQueue<AdmittedWake>
    → dapp-kit-events drainEventKitWakeQueue (synthesizeEventKitAdmittedWake)
      → reducers / projections
```

`drainEventKitWakeQueue` claims bounded work (`maxItems`, `maxDurationMs`), synthesizes a stable event with `synthesizeEventKitAdmittedWake`, appends it durably, requests each declared subscription wake, and only then acks the Event Kit lease; a failure releases it. It drains Durable `WakeQueue` work only — Best Effort hints stay in Event Kit's own inbox and snapshot worker. Wake ranges stay scheduling hints: resume from your own durable source checkpoint, verify source finality or interval completion independently, and never compare Ethereum heights or interval positions with XL1 heights.

Detail for JWT, grants, the handshake, sources, delivery modes, and `wakeId` vs `jti`: [Authenticated Wake Delivery](../xl1-patterns/authenticated-wake-delivery.md).

## Anti-patterns

- Treating wake ranges as finalized chain progress.
- Running the product reducer on the public admit URL.
- Keying durable events by JWT `jti` — it changes on every retry; the stable provenance binds `wakeId`, audience, deployment/queue, publisher, event hash, and the signed envelope.
- One shared cursor for multiple logical consumers.
- Inferring an event-stream “thing” solely because a cloud queue exists — declare deployable things explicitly ([Hosting](hosting.md)).
