# Pharos Multi-Protocol Aggregator

A public, English-only request-to-venue execution desk for Pharos Pacific Mainnet (`1672`). It queries two genuine USDC Morpho vaults, filters candidates by live account state, explains routing, and prepares decoded unsigned approval/deposit/withdraw transactions. It never signs or broadcasts.

## Supported venues

| Venue | Contract | Interface | Official provenance |
|---|---|---|---|
| RockawayX USDC V2 | `0x047cd0a91e9b92ed979189a6c8a120bf280f02e5` | synchronous ERC-4626 `deposit`, `withdraw`, `redeem` | [Morpho campaign](https://campaigns.morpho.org/opportunities/11686569320310112064) |
| SharpByte USDC Pharos Ecosystem | `0x15c25ED222fc498f672af5c3adb5ED0a96E1AFf1` | synchronous ERC-4626 `deposit`, `withdraw`, `redeem` | [Morpho campaign](https://campaigns.morpho.org/opportunities/6848818814763389816) |

Both vaults use USDC `0xC879C018dB60520F4355C26eD1a6D572cdAC1815`. They are two independent vault contracts in one protocol, not two protocols. Morpho's [asset-flow documentation](https://docs.morpho.org/developers/earn/tutorials/assets-flow/) defines the action semantics and explains why Vault V2 standard `max*` functions return zero.

## Decision flow

1. Validate intent and explicit account, receiver, amount, asset, horizon and objective.
2. Pin a Pharos block and fan out through two isolated adapters.
3. Verify bytecode, asset, decimals, balances, allowance, conversion and fixed-share rate evidence.
4. Exclude failed, incompatible or insufficient candidates.
5. Rank eligible candidates by modeled final USDC value minus disclosed USDC cost assumptions.
6. Prepare a bounded approval only when required, followed by venue-specific action calldata.
7. Decode calldata, estimate gas without broadcasting, and label the result `PREPARED`, `CONDITIONAL`, or `BLOCKED`.

Historical share-value change is not APY, guaranteed yield or wallet profit. Gas has no invented USD value. Plans expire after five minutes.

## Run locally

```bash
npm ci
npm test
npm run build
npm run cli -- --intent compare --account 0x15ddce897d76ac39c188ade4d353711a60395315
```

The CLI and web application import the same engine. Available CLI flags include `--request`, `--intent`, `--account`, `--receiver`, `--amount`, `--asset`, `--horizon`, `--objective`, and `--outage`.

## Tests

The suite covers both real adapter interfaces with injected Chain MCP responses, pinned conversions, exact decimals, double-count prevention, cost-sensitive routing, exclusions, balance and allowance handling, approval omission, conditional sequences, calldata decode round trips, owner/receiver preservation, single/all adapter failure, stale plans, and the absence of signing/broadcast capability. Fixtures exercise edge cases only; recorded evidence uses deployed contracts.

## Evidence and design

- [Architecture](docs/architecture.md)
- `evidence/manifest.json`
- `evidence/live-query.json`
- `evidence/live-deposit.json`
- `evidence/live-withdrawal.json`
- `evidence/live-outage.json`

Public examples are unattributed third-party addresses. No project-held wallet or signer exists.
