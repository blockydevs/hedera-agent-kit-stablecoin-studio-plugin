# Stablecoin Studio Plugin Gap Analysis Report

This report compares the currently implemented tools with the full capabilities of the Hashgraph Stablecoin SDK and
outlines the roadmap for future development.

## 1. Feature Support Matrix

### Role Management (`RoleInPort`)

| SDK Method            | Status      | Tool Name                     | Target Phase |
|-----------------------|-------------|-------------------------------|--------------|
| `grantRole`           | ✅ Supported | `GRANT_ROLE_STABLECOIN_TOOL`  | Complete     |
| `revokeRole`          | ✅ Supported | `REVOKE_ROLE_STABLECOIN_TOOL` | Complete     |
| `grantMultiRoles`     | ❌ Missing   | -                             | Phase 2      |
| `revokeMultiRoles`    | ❌ Missing   | -                             | Phase 2      |
| `hasRole`             | ❌ Missing   | -                             | Phase 2      |
| `getRoles`            | ❌ Missing   | -                             | Phase 2      |
| `getAccountsWithRole` | ❌ Missing   | -                             | Phase 2      |
| `getAllowance`        | ✅ Supported | `GET_SUPPLIER_ALLOWANCE_TOOL`       | Complete     |
| `resetAllowance`      | ✅ Supported | `RESET_SUPPLIER_ALLOWANCE_TOOL`     | Complete     |
| `increaseAllowance`   | ✅ Supported | `INCREASE_SUPPLIER_ALLOWANCE_TOOL`  | Complete     |
| `decreaseAllowance`   | ✅ Supported | `DECREASE_SUPPLIER_ALLOWANCE_TOOL`  | Complete     |
| `isLimited`           | ❌ Missing   | -                                   | Phase 2      |
| `isUnlimited`         | ❌ Missing   | -                                   | Phase 2      |

### Stablecoin Operations (`StableCoinInPort`)

| SDK Method               | Status      | Tool Name                                | Target Phase       |
|--------------------------|-------------|------------------------------------------|--------------------|
| `create`                 | ✅ Supported | `CREATE_STABLECOIN_TOOL`                 | Complete           |
| `getInfo`                | ✅ Supported | `GET_STABLECOIN_INFO_TOOL`               | Complete           |
| `cashIn`                 | ✅ Supported | `CASH_IN_STABLECOIN_TOOL`                | Complete           |
| `burn`                   | ✅ Supported | `BURN_STABLECOIN_TOOL`                   | Complete           |
| `rescue`                 | ✅ Supported | `RESCUE_STABLECOIN_TOOL`                 | Complete           |
| `rescueHBAR`             | ✅ Supported | `RESCUE_HBAR_STABLECOIN_TOOL`            | Complete           |
| `wipe`                   | ✅ Supported | `WIPE_STABLECOIN_TOOL`                   | Complete           |
| `associate`              | ✅ Supported | `ASSOCIATE_STABLECOIN_TOOL`              | Complete           |
| `getBalanceOf`           | ✅ Supported | `GET_STABLECOIN_BALANCE_TOOL`            | Complete           |
| `capabilities`           | ✅ Supported | `GET_STABLECOIN_CAPABILITIES_TOOL`       | Complete           |
| `pause`                  | ✅ Supported | `PAUSE_STABLECOIN_TOOL`                  | Complete           |
| `unPause`                | ✅ Supported | `UNPAUSE_STABLECOIN_TOOL`                | Complete           |
| `delete`                 | ✅ Supported | `DELETE_STABLECOIN_TOOL`                 | Complete           |
| `freeze`                 | ✅ Supported | `FREEZE_ACCOUNT_TOOL`                    | Complete           |
| `unFreeze`               | ✅ Supported | `UNFREEZE_ACCOUNT_TOOL`                  | Complete           |
| `isAccountFrozen`        | ✅ Supported | `IS_ACCOUNT_FROZEN_TOOL`                 | Complete           |
| `grantKyc`               | ✅ Supported | `GRANT_KYC_TOOL`                         | Complete           |
| `revokeKyc`              | ✅ Supported | `REVOKE_KYC_TOOL`                        | Complete           |
| `isAccountKYCGranted`    | ✅ Supported | `IS_ACCOUNT_KYC_GRANTED_TOOL`            | Complete           |
| `isAccountAssociated`    | ✅ Supported | `IS_ACCOUNT_ASSOCIATED_TOOL`             | Complete           |
| `updateReserveAddress`   | ✅ Supported | `UPDATE_RESERVE_ADDRESS_STABLECOIN_TOOL` | Complete           |
| `createHold`             | ✅ Supported | `CREATE_HOLD_STABLECOIN_TOOL`            | Complete           |
| `executeHold`            | ✅ Supported | `EXECUTE_HOLD_STABLECOIN_TOOL`           | Complete           |
| `releaseHold`            | ✅ Supported | `RELEASE_HOLD_STABLECOIN_TOOL`           | Complete           |
| `reclaimHold`            | ✅ Supported | `RECLAIM_HOLD_STABLECOIN_TOOL`           | Complete           |
| `update`                 | ✅ Supported | `UPDATE_STABLECOIN_TOOL`                 | Complete           |
| `getReserveAddress`      | ❌ Missing   | -                                        | Phase 2            |
| `createHoldByController` | ❌ Missing   | -                                        | Phase 2            |
| `getHoldFor`             | ❌ Missing   | -                                        | Phase 2            |
| `getHoldCountFor`        | ❌ Missing   | -                                        | Phase 2            |
| `getHoldsIdFor`          | ❌ Missing   | -                                        | Phase 2            |
| `getHeldAmountFor`       | ❌ Missing   | -                                        | Phase 2            |
| `transfers`              | ❌ Missing   | -                                        | Phase 2            |
| `signTransaction`        | ❌ Missing   | -                                        | Phase 3 (Optional) |

### Custom Fees (`CustomFeesInPort`)

| SDK Method         | Status    | Tool Name | Target Phase |
|--------------------|-----------|-----------|--------------|
| `addFixedFee`      | ❌ Missing | -         | Phase 2      |
| `addFractionalFee` | ❌ Missing | -         | Phase 2      |
| `updateCustomFees` | ❌ Missing | -         | Phase 2      |

---

## 2. Implementation Roadmap

### Phase 1: Core Implementation & Stabilization (Complete ✅)
- **Initial Tool Suite**: Implementation of 34 core tools covering lifecycle, role management, supply operations, account status, and escrow (holds).
- **Supplier Allowances**: Added full suite for `CASHIN` allowance management (Increase, Decrease, Reset, Get).
- **Tool Enhancements**: Added advanced parameters to `CREATE_STABLECOIN_TOOL` and `UPDATE_STABLECOIN_TOOL` (metadata, roles, auto-renew, etc.). (*Note: `memo` removed as unsupported by SDK*).
- **Return Bytes Mode**: Fully implemented and verified `RETURN_BYTES` mode across all state-changing tools, enabling external signing workflows.
- **Test Infrastructure**: Developed comprehensive Unit, Integration, and E2E test suites with a centralized global timeout policy and project-wide cleanup.
- **Documentation**: Established full reference documentation in `TOOLS.md` and updated gap analysis.

### Phase 2: Core Governance & Query (Next)

- **RBAC Queries**: `hasRole`, `getRoles`, `getAccountsWithRole`.
- **Custom Fees**: specialized tools for fixed and fractional fee management.
- **Enhanced Holds**: Controller-initiated holds and hold discovery queries.
- **Efficiency**: Introduce `grantMultiRoles` and `revokeMultiRoles`.

### Phase 3: Multi-Sig & Advanced Workflow (Optional)

- **Multi-Sig Infrastructure**: SDK internal transaction management tools.

---

## Appendix 1: Semantic Overlap with Main Kit

While several tools in this plugin cover ground similar to the main `hedera-agent-kit`, they are **explicitly targeting
stablecoin logic** in their prompts and metadata.

| Operation         | Plugin Tool                   | Main Kit Alternative                    | Benefit of Plugin Tool                        |
|-------------------|-------------------------------|-----------------------------------------|-----------------------------------------------|
| Association       | `ASSOCIATE_STABLECOIN_TOOL`   | `ASSOCIATE_TOKEN_TOOL`                  | Explicitly framed for stablecoin onboarding.  |
| Association Check | `IS_ACCOUNT_ASSOCIATED_TOOL`  | `GET_ACCOUNT_QUERY_TOOL`                | Direct "yes/no" check for token relationship. |
| Balance Check     | `GET_STABLECOIN_BALANCE_TOOL` | `GET_ACCOUNT_TOKEN_BALANCES_QUERY_TOOL` | Returns display units via SC logic directly.  |

**LLM Rationale**: Using specialized tools within this plugin provides better semantic grounding for LLMs.
Stablecoin-specific descriptions make the tools easier for the model to understand and select during complex management
scenarios compared to generic HTS tools.

---

## Appendix 2: Suggested Plugin Split

To improve modularity and separate state-changing transactions from read-only state checks, the package can be split
into specialized plugins.

### Suggested Modules:

1. `StablecoinQueryPlugin`: Read-only queries (Balances, Roles, Holds, Info).
2. `StablecoinLifecyclePlugin`: Creation, Updates, Pausing, and Deletion.
3. `StablecoinRolePlugin`: RBAC management (Grant/Revoke roles).
4. `StablecoinSupplyPlugin`: Cash-in, Burn, Wipe, and Transfers.
5. `StablecoinHoldPlugin`: Escrow management.
6. `StablecoinFeePlugin`: Custom fee management.

### Example Langchain Integration:

```typescript
import { HederaLangchainToolkit } from '@hashgraph/hedera-agent-kit-langchain';
import {
  createStablecoinQueryPlugin,
  createStablecoinLifecyclePlugin,
  createStablecoinSupplyPlugin
} from 'hak-stablecoin-studio-plugin';

const hederaAgentToolkit = new HederaLangchainToolkit({
  client,
  configuration: {
    plugins: [
      // Separated plugins for better tool discovery and modularity
      createStablecoinQueryPlugin(config),
      createStablecoinLifecyclePlugin(config),
      createStablecoinSupplyPlugin(config),
    ],
    context: {
      mode: AgentMode.AUTONOMOUS,
    },
  },
});

const tools = hederaAgentToolkit.getTools();
```
