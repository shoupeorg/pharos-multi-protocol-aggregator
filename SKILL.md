---
name: pharos-multi-protocol-aggregator
description: Query two supported Pharos USDC vaults and prepare eligibility-aware unsigned deposit or withdrawal plans.
---

# Pharos Multi-Protocol Aggregator

Use this skill for supported Pharos vault positions, rate comparison, deposit routing and withdrawal routing.

1. Require chain `1672`, an explicit account, and an explicit receiver and positive USDC amount for actions.
2. Query every configured adapter independently at a pinned block. Preserve per-venue failures.
3. Treat RockawayX and SharpByte as two Morpho vaults, not two independent protocols.
4. Do not interpret Morpho Vault V2 standard `max* == 0` as zero capacity; disclose the documented limitation and validate the account-specific action.
5. Compare only the same USDC asset and fixed-share historical window. Never label it guaranteed APY or personal profit.
6. For deposits, read USDC balance and allowance. Add only a bounded approval to the selected vault when necessary.
7. For withdrawals, require a non-zero verified share position and sufficient converted exposure. Keep owner, caller and receiver explicit.
8. Decode prepared calldata and use read-only gas estimation. Approval-dependent actions remain `CONDITIONAL`.
9. Never sign, broadcast, create a wallet, request funding, or deploy a contract.

CLI:

```bash
pharos-aggregate --intent deposit --account 0x... --receiver 0x... --amount 10 --asset USDC --horizon 30
```
