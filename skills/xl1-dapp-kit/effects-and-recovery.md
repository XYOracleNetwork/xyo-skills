# Effects and Recovery

Read when the dApp performs XL1 writes or any multi-step effect that must survive process death.

## Thesis

Commands produce **attributable, staged receipts** (prepared → signed → content → broadcast → inclusion → finality, as applicable). There is **no fictional atomicity** across chain + datalake. **Crash recovery is first-class.**

Neutral planning helpers (names live in `@xyo-network/dapp-kit`) such as effect planning / reconciler / `recoverEffectJournal` keep pure planning separate from injected I/O.

## Effect journal

- Persist journal entries and **prepared-effect sidecars** as their own durability class.
- Compaction and resume must be defined; SIGKILL mid-broadcast must not strand unrecoverable ambiguity.
- On new incarnation: **recover from durable state**, then continue — do not “start clean” and orphan in-flight effects.

## Anti-patterns

| Don't | Do |
|-------|-----|
| Fire-and-forget `gateway.send` with no journal | Stage + journal + reconcile |
| Assume chain+lake write is one transaction | Explicit stages + recovery |
| Put signing keys in the UI process “for convenience” | Host-held keys; UI is a client |
| Ignore inclusion/finality after broadcast | Drive stages to the profile’s required horizon |

For chain access rules themselves, still obey [Gateway](../xl1-knowledge/gateway.md) (no raw RPC / no Ethereum SDKs against XL1).
