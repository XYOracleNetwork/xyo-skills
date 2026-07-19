# Unattended Sequence Testing (CLI wallet + keychain)

> Sub-doc of [xl1-testing](SKILL.md). Approach: an external, funded actor on the
> Sequence testnet driven through the standalone `xl1-wallet` CLI, unattended.

Set up an agent to run **unattended** tests against the XL1 **Sequence testnet**
using the standalone `xl1-wallet` CLI (`@xyo-network/wallet-xl1-cli`), with the
wallet password held in the OS keychain so no interactive prompt blocks
automation.

## ⛔ TESTNET ONLY — read first

This approach creates a **hot wallet**: the password is stored in the keychain and
auto-loaded, so anything with access to this machine can move funds without a
prompt. That is acceptable **only** because the wallet holds nothing but valueless
**Sequence test tokens**.

- **Never** point this wallet, this password entry, or these unattended flows at
  `xl1-mainnet` or any wallet that holds real XL1.
- **Never** import a mainnet/recovery phrase that controls real funds into the
  test wallet home.
- Fund the test address **only** with Sequence test tokens, and keep the balance
  minimal (enough for gas + the amounts under test).
- If you are ever unsure which network is active, **stop and check** (see
  [Guardrail](#guardrail-verify-the-network-before-every-send)) before any `send`.

If the user asks to run this against mainnet or with real XL1, refuse and explain
that this approach is testnet-only by design.

## When to use this vs. headless testnet verification

- **This approach** — you need an external, funded **actor** on Sequence driven
  through the `xl1-wallet` CLI (fund an address, send real testnet transactions,
  broadcast signed tx files), running unattended over many invocations with the
  password in the keychain.
- **[Headless testnet verification](headless-testnet-verification.md)** — you need
  to verify a dApp's chain interactions **in-process** from a Node script using a
  seed phrase in `.env` and `GatewayBuilder.build(signer)`. Lighter weight, no CLI.

They compose: use this approach to fund/operate a Sequence actor, and headless
testnet verification to assert program behavior.

## Prerequisites

- macOS with the `security` CLI (present by default). For Linux, substitute
  `secret-tool` (libsecret) — the flow is identical, only the keychain commands differ.
- Node.js `>=18.17.1`.
- The `xl1-wallet` CLI. Install globally:

  ```sh
  npm install -g @xyo-network/wallet-xl1-cli
  xl1-wallet --help
  ```

  Or run it from a checkout of the `ariestools` repo: `pnpm xy compile @xyo-network/wallet-xl1-cli` then `pnpm xl1-wallet ...`.

## How the CLI supports unattended runs

- **`ARIES_WALLET_PASSWORD`** — when set and non-empty, every command uses it
  instead of prompting for the password (both first-time init and later unlocks).
  This is the hook this skill relies on; the value comes from the keychain.
- **`XL1_WALLET_HOME`** — overrides the wallet storage directory (default
  `~/.xl1/wallet/cli`). Use a dedicated directory so the test wallet is isolated
  from any real wallet on the machine.
- Seed phrases are encrypted at rest under the wallet home; commands needing key
  access decrypt with the password.

## One-time setup

Do this once per machine. All steps are scripted — no prompts.

**1. Choose an isolated wallet home and keychain identifiers.**

```sh
export XL1_WALLET_HOME="$HOME/.xl1/wallet/sequence-test"   # isolated from any real wallet
KEYCHAIN_SERVICE="xl1-wallet-sequence"                      # keychain entry name
```

Keep `XL1_WALLET_HOME` exported (or re-export it) on **every** unattended run so
the CLI targets the test wallet, not the default home.

**2. Generate a strong password and store it in the keychain.**

```sh
# Generate once and store; -U updates the entry if it already exists.
PW="$(openssl rand -base64 24)"
security add-generic-password -a "$USER" -s "$KEYCHAIN_SERVICE" -w "$PW" -U
unset PW   # do not keep the plaintext around
```

**3. Create the wallet, non-interactively, using the keychained password.**

```sh
export ARIES_WALLET_PASSWORD="$(security find-generic-password -a "$USER" -s "$KEYCHAIN_SERVICE" -w)"

xl1-wallet create --label sequence-test        # the FIRST wallet in a home is auto-activated
xl1-wallet network use xl1-sequence            # select the Sequence testnet
xl1-wallet account derive 0 --label root       # derive the funding/root account (offset 0)
```

`create` prints the recovery phrase to stdout **once**. In an isolated,
disposable testnet home this is low-risk, but don't persist that output into
logs you keep. If the home already contains a wallet, a new one is not
auto-activated — run `xl1-wallet use <id>` to select it.

**4. Read the root address to fund.** Account **offset 0** is the address tests
send from and the one the user funds:

```sh
ROOT_ADDR="$(xl1-wallet account show 0 --json | jq -r .address)"
echo "Fund this Sequence address: $ROOT_ADDR"
```

Always `unset ARIES_WALLET_PASSWORD` when a batch of commands is done if the shell
persists, so the plaintext isn't left in the environment longer than needed.

## Funding the wallet (requires the user)

The agent cannot obtain Sequence test tokens itself. **Ask the user to transfer
Sequence test tokens** to the root address, and make the network explicit:

> Please send some **XL1 Sequence testnet** tokens to `‹ROOT_ADDR›`
> (network `xl1-sequence`). This is a test wallet — a small amount is enough to
> cover gas plus the amounts under test. Do **not** send mainnet XL1.

Then poll the balance until it arrives:

```sh
export ARIES_WALLET_PASSWORD="$(security find-generic-password -a "$USER" -s "$KEYCHAIN_SERVICE" -w)"
until [ "$(xl1-wallet balance 0 --json | jq -r '.atto')" != "0" ]; do
  echo "waiting for Sequence test funds…"; sleep 15
done
xl1-wallet balance 0 --json | jq '{ xl1, atto, network: .network.id }'
```

`balance --json` returns `{ address, offset, xl1, atto, network: { id, rpcUrl } }`.

## Running unattended tests

Every unattended invocation follows the same shape: export the password from the
keychain, (re-)export the isolated wallet home, run commands with `--json`.

```sh
export XL1_WALLET_HOME="$HOME/.xl1/wallet/sequence-test"
export ARIES_WALLET_PASSWORD="$(security find-generic-password -a "$USER" -s xl1-wallet-sequence -w)"
```

Common operations (all support `--json` for parsing):

```sh
# Balance of the root account
xl1-wallet balance 0 --json

# Dry-run a transfer first — signs and validates the plan WITHOUT submitting
xl1-wallet send <recipient> 1 --xl1 --offset 0 --dry-run --json

# Real transfer on Sequence (units: --xl1 default, or --milli/--micro/--nano/--pico/--femto/--atto)
xl1-wallet send <recipient> 1 --xl1 --offset 0 --json

# Sign / broadcast a transaction file (on-chain payloads)
xl1-wallet tx sign  unsigned-transaction.json --output signed-transaction.json
xl1-wallet tx broadcast signed-transaction.json
```

Prefer `--dry-run` first to validate the transaction plan, then submit. Parse the
`--json` output rather than scraping text.

### Optional: session unlock

`xl1-wallet unlock --ttl <seconds>` caches a short-lived encrypted session so
follow-up commands skip the prompt. With `ARIES_WALLET_PASSWORD` set from the
keychain you don't need it, but it's available if you prefer not to keep the env
var exported across a long run. `xl1-wallet lock` clears the session.

## Guardrail: verify the network before every send

Before any `send`, `tx broadcast`, or funding instruction, assert the active
network is Sequence — never mainnet:

```sh
NET="$(xl1-wallet network list --json | jq -r '.[] | select(.active == true) | .id')"
# (or read .network.id from `xl1-wallet balance 0 --json`)
if [ "$NET" != "xl1-sequence" ]; then
  echo "ABORT: active network is '$NET', not xl1-sequence. Refusing to send." >&2
  exit 1
fi
```

`network list --json` returns an array of `{ id, label, rpcUrl, active }`, where
`active` is a boolean marking the selected network — hence the `select(.active
== true)` filter above. `balance --json` also carries the active network at
`.network.id` if you prefer a single call.

Networks available by default: `xl1-sequence` (testnet,
`https://beta.api.chain.xyo.network/rpc`) and `xl1-mainnet`
(`https://api.chain.xyo.network/rpc`). This skill's flows are valid **only** for
`xl1-sequence`.

## Rotation / teardown

The test wallet is disposable. To rotate or tear down:

```sh
xl1-wallet reset                                                   # delete local wallet CLI data (in this XL1_WALLET_HOME)
security delete-generic-password -a "$USER" -s xl1-wallet-sequence # remove the keychain entry
```

Because only test tokens are ever at risk, a compromised test wallet costs
nothing — recreate it and re-fund.

## Cross-References

- [Headless testnet verification](headless-testnet-verification.md) — in-process, seed-phrase dApp verification (the lighter alternative).
- [xl1-testing](SKILL.md) — the testing barrel this approach belongs to.
- [xl1-knowledge / Node Gateway](../xl1-knowledge/gateway-node.md) — programmatic gateway construction. Note the SDK's `DefaultNetworks` id for the same testnet is `sequence` (the standalone CLI names it `xl1-sequence`); the RPC URL is identical.
- [xl1-knowledge / Gateway](../xl1-knowledge/gateway.md) — networks table, transaction methods, units (AttoXL1).
