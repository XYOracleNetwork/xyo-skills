# Effects and Recovery

Read when the dApp performs XL1 writes or any multi-step effect that must survive process death.

## Thesis

Commands produce **attributable, staged receipts**. The evidence stages, in order, are exactly `prepared` → `signed` → `content-written` → `content-verified` → `broadcast` → `included` → `finalized`. The two content stages apply only when the effect's `contentPolicy` is `required-before-broadcast`; the other five are always required for an XL1 transaction effect. There is no `confirmed` stage — do not invent one. There is **no fictional atomicity** across chain + datalake. **Crash recovery is first-class.**

Neutral helpers in `@xyo-network/dapp-kit` keep pure planning separate from injected I/O:

- `planXl1TransactionEffect(receipt)` — selects the next safe action for a receipt, with no I/O.
- `createXl1TransactionEffectReconciler(capabilities)` — drives that action through injected capabilities (`sign`, `writeContent`, `verifyContent`, `reconcileBroadcast`, `observeInclusion`, `observeFinality`).
- `recoverEffectJournal(options)` — one bounded recovery pass over the journal's incomplete receipts.

Journal implementations come from host packages: `FileEffectReceiptJournal` (`@xyo-network/dapp-kit-node`; crash-durable file journal with exclusive single-host write ownership) and `VercelBlobEffectPreparationJournal` (`@xyo-network/dapp-kit-vercel`; private Blob envelope fenced by deployment epoch).

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
