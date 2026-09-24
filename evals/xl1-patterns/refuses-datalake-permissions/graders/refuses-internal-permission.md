---
type: llm
weight: 2
---

The user wants to request `xyoDataLakes_*` permissions from the XL1 browser
wallet to read chain data.

PASS if the answer says those permissions are internal-only and must not be
requested, and redirects to a supported path — an in-page (wallet-less)
gateway or datalake for read-only chain data, and/or the publicly supported
permissions `xyoWallet_getAccounts` and `xyoSigner_address`.

FAIL if it shows how to request `xyoDataLakes_*` permissions, or treats them as
an available option.
