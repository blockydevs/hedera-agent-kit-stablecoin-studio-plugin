# Stablecoin Studio Overview & Concepts

Stablecoin Studio is the standard framework for creating and managing regulated stablecoins on the Hedera network. This plugin enables an AI agent to operate within this framework, providing a high-level governance layer over native Hedera Token Service (HTS) assets.

## Core Resources
- **Official Documentation**: [Hedera Stablecoin Studio Concepts](https://docs.hedera.com/hedera/open-source-solutions/stablecoin-studio/core-concepts)
- **Governance Framework**: Learn about the Smart Contract-based Role-Based Access Control (RBAC) that secures every operation.

---

## Core Concepts

### 1. Token Management via Smart Contract (Not Just Private Keys)

This is the most important concept to understand about Stablecoin Studio. In standard HTS, token operations
(minting, freezing, wiping) are authorized by **private keys** attached to the token at creation. This is
fragile: whoever holds the key controls everything, and rotating it is complex.

Stablecoin Studio replaces this model entirely. Instead, **all privileged operations are routed through a
proxy smart contract** deployed on the Hedera Smart Contract Service (HSCS). The flow is:

```
Agent / User
    │
    ▼
Stablecoin SDK (builds a smart contract call transaction)
    │
    ▼
Proxy Smart Contract (checks Role-Based Access Control)
    │
    ▼
HTS System Contract (performs the actual HTS operation: mint, wipe, freeze…)
```

This means:
- **No private key** is needed for governance operations on the token itself — the smart contract is the
  authorized key holder.
- **Permissions are managed on-chain** via role assignments in the contract's RBAC system.
- The smart contract is the **supply key**, **wipe key**, and **freeze key** all at once. It delegates
  those abilities to accounts based on their assigned roles.
- The proxy is **upgradeable** — the admin can point it to a new implementation contract without changing
  the token ID.

> ⚠️ This is why tools like `RESCUE_STABLECOIN_TOOL` exist: tokens can accidentally be sent to the
> smart contract address itself (since it is a real Hedera account from the network's perspective), and
> without a rescue mechanism, they would be permanently locked.

---

### 2. Smart Contract Governance (RBAC)

Unlike basic HTS tokens where permissions are bound to private keys, Stablecoin Studio assets are governed
by a **Smart Contract**. Roles like `CASHIN_ROLE` (minting) or `FREEZE_ROLE` are assigned to Hedera Account
IDs within the contract. This allows for:
- **Transparent Permissions**: Anyone can query who has which role.
- **Organizational Delegations**: Roles can be assigned to multi-sig accounts or DAO contracts.

### Specialized Roles
The plugin supports all standard Stablecoin Studio roles:

| Role                | Capability                                                     |
|---------------------|----------------------------------------------------------------|
| `DEFAULT_ADMIN_ROLE`| Full administrative control (grant/revoke roles, update reserve address). Only this role can change the PoR contract address. |
| `CASHIN_ROLE`       | The only role allowed to increase the token supply (mint). Can be "Unlimited" (unrestricted minting) or "Limited" (subject to a specific allowance). |
| `BURN_ROLE`         | Allows destroying tokens held in the treasury.                 |
| `WIPE_ROLE`         | Allows removing tokens from **any** account (compliance/fraud recovery). |
| `FREEZE_ROLE`       | Allows locking a specific account's balance.                   |
| `PAUSE_ROLE`        | Allows pausing/unpausing **all** token operations globally.    |
| `DELETE_ROLE`       | Allows permanently deleting the token (requires zero supply).  |
| `KYC_ROLE`          | Allows setting/revoking the KYC flag on individual accounts.   |
| `RESCUE_ROLE`       | Allows recovering HBAR or tokens accidentally sent to the contract address. |
| `CUSTOM_FEES_ROLE`  | Allows modifying the custom fee schedule for the token.        |
| `HOLD_CREATOR_ROLE` | Allows locking tokens in escrow (creating holds).              |

---

### 3. Escrow & The Hold Mechanism

A **Hold** is an on-chain escrow primitive. It allows tokens to be **locked** in a pending state — moved
out of the payer's available balance but not yet delivered to the recipient. This guarantees payment at
the smart contract level without requiring immediate settlement.

#### Roles in a Hold

Three distinct parties are involved:

| Party             | Who are they?                                                                 |
|-------------------|-------------------------------------------------------------------------------|
| **Hold Creator**  | An account with `HOLD_CREATOR_ROLE`. Initiates the hold on behalf of a payer. |
| **Payer (source)**| The account whose tokens are locked. They cannot move the held amount.         |
| **Escrow Agent**  | A designated account (`escrow` parameter). The **only** entity that can execute or release the hold while it is active. |

> The Hold Creator and the Escrow Agent do **not** have to be the same account. For example: a
> payment platform (Hold Creator) creates a hold designating a bank settlement service (Escrow Agent)
> to finalize it.

#### Hold Lifecycle

```
[CREATE_HOLD]           → Tokens locked in pending state
       │
       ├─ Escrow Agent executes → [EXECUTE_HOLD] → Tokens sent to recipient
       ├─ Escrow Agent cancels  → [RELEASE_HOLD] → Tokens returned to payer
       └─ Hold expires, ignored → [RECLAIM_HOLD] → Tokens returned to payer (callable by anyone)
```

#### Why use a Hold?
- **Double-spend prevention**: The payer cannot spend the held tokens elsewhere.
- **Non-custodial**: Tokens never leave the Hedera ledger — no third-party custody needed.
- **Atomic settlement**: Either the escrow agent completes it, or it eventually expires and reverts.
- **Timeout protection**: Holds have an `expirationDate`. If the escrow agent goes offline or is
  compromised, tokens are not permanently locked — they can be reclaimed after expiry.

---

### 4. Proof of Reserve (PoR)

**Proof of Reserve** is a transparency mechanism that lets any on-chain or off-chain observer verify that
the circulating supply of a stablecoin is backed by real-world assets (e.g., USD in a bank account,
gold in a vault, collateral in a smart contract).

#### How it works in Stablecoin Studio

When a stablecoin is created with `createReserve: true`, the factory contract deploys a **PoR smart
contract** alongside the token proxy. This reserve contract:

1. Implements a **Chainlink AggregatorV3Interface** — the industry-standard oracle interface for
   reserve feeds.
2. Exposes a `latestRoundData()` function that returns the **current reserve balance** (in the
   smallest token unit).
3. Is stored by address inside the token's proxy contract.

#### The `reserveAddress`

The `reserveAddress` is the **Hedera account ID or EVM address of this reserve contract**. It is:
- Set automatically when `createReserve: true` is used.
- Readable via `GET_STABLECOIN_INFO_TOOL` (returned in the token info).
- Updatable only by the `DEFAULT_ADMIN_ROLE` via `UPDATE_RESERVE_ADDRESS_STABLECOIN_TOOL`.

> ⚠️ The `reserveAddress` is **not** a regular user account. It is a smart contract. Pointing it to a
> regular account ID or a wrong contract will make PoR queries return incorrect data.

#### Reserve Feeds & Off-Chain Oracles

For fiat-backed stablecoins, the reserve contract typically reads from an **off-chain oracle** (e.g.,
Chainlink, Supra Oracles) that periodically publishes the custodian's confirmed balance. The flow is:

```
Custodian (bank/vault)
        │  (reports balance off-chain)
        ▼
Oracle Network (e.g., Chainlink node)
        │  (publishes on-chain transaction)
        ▼
Reserve Smart Contract (stores latestRoundData)
        │  (queried by anyone)
        ▼
Stablecoin Studio / Auditor / Agent
```

#### PoR Verification Flow (Scenario H)
1. Query the `reserveAddress` from `GET_STABLECOIN_INFO_TOOL`.
2. Call `latestRoundData()` on the reserve contract to get the confirmed reserve balance.
3. Compare with `totalSupply` from `GET_STABLECOIN_INFO_TOOL`.
4. If `reserve ≥ totalSupply`, the stablecoin is fully collateralized.

---

## Example Usage Flows

### Scenario A: Launch & Organizational Setup
For an organization launching a new internal currency:
1. **Creation**: Use `CREATE_STABLECOIN_TOOL` to deploy the token. Set the `adminKey` to the main organization account.
2. **Delegation**: Use `GRANT_ROLE_STABLECOIN_TOOL` to assign roles to departments:
    - Grant `CASHIN_ROLE` to the Payroll account.
    - Grant `BURN_ROLE` to the Finance account.
    - Grant `KYC_ROLE` to the Compliance account.
3. **Verification**: Use `GET_STABLECOIN_CAPABILITIES_TOOL` to verify that each account has the correct permissions.

### Scenario B: Controlled Distribution
To distribute funds to a set of employees or users:
1. **Onboarding**: Use `ASSOCIATE_STABLECOIN_TOOL` for each recipient account.
2. **Compliance**: The compliance account uses `GRANT_KYC_TOOL` for each associated user.
3. **Minting**: The payroll account uses `CASH_IN_STABLECOIN_TOOL` to mint tokens directly into the recipients' accounts.
4. **Monitoring**: Use `GET_STABLECOIN_INFO_TOOL` to track the increase in `totalSupply`.

### Scenario C: Onboarding a New Regulated User
1. **Association**: Use `ASSOCIATE_STABLECOIN_TOOL` to link the user's account to the token.
2. **KYC Grant**: Use `GRANT_KYC_TOOL` to mark the account as compliant.
3. **Minting**: Use `CASH_IN_STABLECOIN_TOOL` to deposit their initial funds.

### Scenario D: Compliance Enforcement
If an account is flagged for suspicious activity:
1. **Status Check**: Use `IS_ACCOUNT_FROZEN_TOOL` to verify current state.
2. **Freeze**: Use `FREEZE_ACCOUNT_TOOL` to immediately prevent any transfers.
3. **Investigation**: While frozen, the funds remain in the account but cannot be moved.
4. **Wipe**: If fraud is confirmed, use `WIPE_STABLECOIN_TOOL` to remove the illicit funds.

### Scenario E: Secure Payment via Hold
For a high-value purchase where funds must be "guaranteed" but not yet settled:
1. **Create Hold**: The payment platform (with `HOLD_CREATOR_ROLE`) calls `CREATE_HOLD_STABLECOIN_TOOL`,
   designating a settlement service as the `escrow` agent. The buyer's tokens are locked.
2. **Fulfillment**: Once goods are confirmed delivered, the **escrow agent** (not the creator) calls
   `EXECUTE_HOLD_STABLECOIN_TOOL` to transfer the tokens to the merchant.
3. **Cancellation**: If the deal falls through before the hold expires, the **escrow agent** calls
   `RELEASE_HOLD_STABLECOIN_TOOL` to refund the buyer.
4. **Expiry Recovery**: If the escrow agent fails to act and the hold expires, **anyone** (e.g., an admin
   cron job) can call `RECLAIM_HOLD_STABLECOIN_TOOL` to return the tokens to the buyer.

### Scenario F: Organizational Treasury Rebalancing
When a stablecoin needs to reduce its total circulating supply due to a reserve decrease:
1. **Balance Check**: Use `GET_STABLECOIN_BALANCE_TOOL` on the Treasury account.
2. **Wipe (Optional)**: If tokens need to be pulled from a sub-treasury, use `WIPE_STABLECOIN_TOOL`.
3. **Burn**: Use `BURN_STABLECOIN_TOOL` to permanently remove the tokens from the treasury, aligning the supply with the reserve.

### Scenario G: Mass Compliance Update (Batch KYC)
When a regulatory change requires re-verifying a group of users:
1. **Check Status**: Use `IS_ACCOUNT_KYC_GRANTED_TOOL` to identify accounts.
2. **Revoke**: Use `REVOKE_KYC_TOOL` to pause their ability to transfer.
3. **Re-Grant**: Once they provide new documentation, use `GRANT_KYC_TOOL` to restore access.

### Scenario H: Proof of Reserve (PoR) Verification
For transparency, an agent can verify that the stablecoin is backed by assets:
1. **Get Reserve Address**: Use `GET_STABLECOIN_INFO_TOOL` to read the `reserveAddress` from the token info.
2. **Query Reserve**: Call `latestRoundData()` on the reserve contract at that address to get the confirmed balance.
3. **Compare Supply**: Use `GET_STABLECOIN_INFO_TOOL` to get `totalSupply`.
4. **Audit Report**: Report whether `reserve ≥ totalSupply` (fully collateralized) or not.

### Scenario I: Updating the Reserve Contract
When an organization upgrades to a new oracle or reserve provider:
1. **Deploy new PoR contract**: The new contract must implement the Chainlink AggregatorV3 interface.
2. **Update pointer**: The `DEFAULT_ADMIN_ROLE` account calls `UPDATE_RESERVE_ADDRESS_STABLECOIN_TOOL`
   with the new contract's address.
3. **Verify**: Call `GET_STABLECOIN_INFO_TOOL` to confirm the new address is recorded.

### Scenario J: Recovering Stuck Assets (Rescue)
If tokens or HBAR are accidentally sent to the stablecoin's proxy contract address:
1. **Identify**: An operator notices the contract's token balance is unexpectedly non-zero (tokens
   sent to the contract address, not the treasury).
2. **Rescue tokens**: The account with `RESCUE_ROLE` calls `RESCUE_STABLECOIN_TOOL` with the amount
   to recover. Tokens are moved to the treasury.
3. **Rescue HBAR**: If HBAR was sent to the contract, call `RESCUE_HBAR_STABLECOIN_TOOL` instead.
   HBAR is moved to the treasury.

### Scenario K: Managing Suppliers & Minting Allowances
For organizations that delegate minting to multiple departments with strict limits:
1. **Grant Supplier Role**: Use `GRANT_SUPPLIER_ROLE_TOOL` to give a department the `CASHIN_ROLE` with a specific `amount` (e.g., 50,000 units).
2. **Monitor Usage**: Use `GET_SUPPLIER_ALLOWANCE_TOOL` periodically to see how much of the allowance remains.
3. **Adjust Limits**:
    - Use `INCREASE_SUPPLIER_ALLOWANCE_TOOL` when a department needs more liquidity.
    - Use `DECREASE_SUPPLIER_ALLOWANCE_TOOL` to reduce their capacity.
    - Use `RESET_SUPPLIER_ALLOWANCE_TOOL` to immediately stop their minting ability (by setting allowance to zero).
4. **Revoke Access**: Use `REVOKE_SUPPLIER_ROLE_TOOL` to permanently remove their minting permissions.
