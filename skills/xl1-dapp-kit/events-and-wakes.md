# Events and Wakes

Read when the dApp is event-driven or integrates Event Kit.

## Three contracts (do not merge)

| Contract | Owner | Meaning |
|----------|-------|---------|
| **Event Kit wake** | `@xyo-network/event-kit-*` | Wallet-JWT admission + enqueue hint |
| **dapp-kit durable event** | `@xyo-network/dapp-kit` / `-events` | Ordered partitioned application-event log + fingerprint / collision rules |
| **Subscription cursor** | dapp-kit | Independent fence per logical consumer; **at-least-once** delivery |

Exact-once outcomes require **idempotent** consumers, not a stronger wake promise.

## Composition

```text
Statement Graph grants
  → Event Kit admitAndEnqueue / WakeQueue
    → dapp-kit-events durable synthesis + subscription drain
      → reducers / projections
```

Detail for JWT, grants, and `wakeId` vs `jti`: [Authenticated Wake Delivery](../xl1-patterns/authenticated-wake-delivery.md).

## Anti-patterns

- Treating wake ranges as finalized chain progress.
- Running the product reducer on the public admit URL.
- One shared cursor for multiple logical consumers.
- Inferring an event-stream “thing” solely because a cloud queue exists — declare deployable things explicitly ([Hosting](hosting.md)).
