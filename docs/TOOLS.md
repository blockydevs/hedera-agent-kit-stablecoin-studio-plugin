# Hedera Agent Kit Stablecoin Studio Plugin Tools

This document provides a detailed reference for all tools available in the Hedera Agent Kit Stablecoin Studio Plugin.
These tools interact with the Stablecoin Studio smart contracts to provide a regulated, secure framework for token
management.

## Lifecycle Tools

### CREATE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Any account that has been configured as the plugin operator. There are no on-chain role restrictions for creation — the factory contract is open. The calling account automatically becomes the `DEFAULT_ADMIN_ROLE` holder and proxy owner (unless `proxyOwnerAccount` is explicitly overridden).

Deploys a new regulated stablecoin with customized governance roles and supply rules.

#### Parameters

| Parameter                | Type      | Required | Default      | Description                                             |
|--------------------------|-----------|----------|--------------|---------------------------------------------------------|
| `name`                   | `string`  | ✅        | -            | The name of the stablecoin (e.g., "USD Coin").          |
| `symbol`                 | `string`  | ✅        | -            | The token symbol (e.g., "USDC").                        |
| `decimals`               | `number`  | ❌        | `6`          | Number of decimal places (e.g., 6).                     |
| `initialSupply`          | `string`  | ❌        | `"0"`        | Initial token supply in display units (e.g., "1000.5"). |
| `maxSupply`              | `string`  | ❌        | -            | Max supply for FINITE type (e.g., "1000000").           |
| `supplyType`             | `enum`    | ❌        | `"INFINITE"` | `"FINITE"` or `"INFINITE"`.                             |
| `metadata`               | `string`  | ❌        | -            | Arbitrary metadata (e.g., "v1.0.0-audit-pass").         |
| `freezeDefault`          | `boolean` | ❌        | `false`      | If true, new accounts are frozen by default.            |
| `autoRenewAccount`       | `string`  | ❌        | -            | Account ID for auto-renew (e.g., "0.0.123456").         |
| `autoRenewPeriod`        | `number`  | ❌        | -            | Period in seconds (e.g., 7776000).                      |
| `cashInRoleAllowance`    | `string`  | ❌        | -            | Initial minting allowance (e.g., "50000").              |
| `createReserve`          | `boolean` | ❌        | `false`      | Whether to deploy a Proof of Reserve contract alongside the token. When `true`, a Chainlink-compatible reserve contract is created and its address is stored in the token's proxy contract. See [Proof of Reserve](#proof-of-reserve-por) for details. |
| `proxyOwnerAccount`      | `string`  | ❌        | operator     | Account ID for proxy owner (e.g., "0.0.123456").        |
| `burnRoleAccount`        | `string`  | ❌        | operator     | Account ID for BURN_ROLE (e.g., "0.0.123456").          |
| `wipeRoleAccount`        | `string`  | ❌        | operator     | Account ID for WIPE_ROLE (e.g., "0.0.123456").          |
| `rescueRoleAccount`      | `string`  | ❌        | operator     | Account ID for RESCUE_ROLE (e.g., "0.0.123456").        |
| `pauseRoleAccount`       | `string`  | ❌        | operator     | Account ID for PAUSE_ROLE (e.g., "0.0.123456").         |
| `freezeRoleAccount`      | `string`  | ❌        | operator     | Account ID for FREEZE_ROLE (e.g., "0.0.123456").        |
| `deleteRoleAccount`      | `string`  | ❌        | operator     | Account ID for DELETE_ROLE (e.g., "0.0.123456").        |
| `kycRoleAccount`         | `string`  | ❌        | operator     | Account ID for KYC_ROLE (e.g., "0.0.123456").           |
| `cashInRoleAccount`      | `string`  | ❌        | operator     | Account ID for CASHIN_ROLE (e.g., "0.0.123456").        |
| `feeRoleAccount`         | `string`  | ❌        | operator     | Account ID for CUSTOM_FEES_ROLE (e.g., "0.0.123456").   |
| `holdCreatorRoleAccount` | `string`  | ❌        | operator     | Account ID for HOLD_CREATOR_ROLE (e.g., "0.0.123456").  |

#### Example Prompts

```
Create a new stablecoin named "Test USD" with symbol "TUSD"
Create a stablecoin named "CorpCoin" (CC) with 8 decimals and initial supply of 1000. Proceed immediately.
Create a finite supply stablecoin named "Gold Backed" (GLD) with initial supply 100 and max supply 1000. Proceed immediately.
Create a stablecoin named "PayCoin" (PC) and set the burn role to account 0.0.789012. Proceed immediately.
```

---

### GET_STABLECOIN_INFO_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Any account. This is a read-only query — no on-chain role is required.

Retrieves the current state, supply, keys, and metadata of a stablecoin.

#### Parameters

| Parameter | Type     | Required | Description                               |
|-----------|----------|----------|-------------------------------------------|
| `tokenId` | `string` | ✅        | The Hedera token ID (e.g., "0.0.123456"). |

#### Example Prompts

```
Get information about stablecoin 0.0.123456
What is the current total supply of token 0.0.123456?
Show me the keys and treasury for stablecoin 0.0.123456
```

---

### UPDATE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding the **Admin Key** of the HTS token (typically the proxy smart contract, whose admin is the `DEFAULT_ADMIN_ROLE` holder).

Updates metadata for an existing stablecoin.

#### Parameters

| Parameter  | Type     | Required | Description                                         |
|------------|----------|----------|-----------------------------------------------------|
| `tokenId`  | `string` | ✅        | The Hedera token ID to update (e.g., "0.0.123456"). |
| `name`     | `string` | ❌        | New name for the stablecoin (e.g., "New Dollar").   |
| `symbol`   | `string` | ❌        | New symbol for the stablecoin (e.g., "ND").         |
| `metadata` | `string` | ❌        | New arbitrary metadata (e.g., "rev-2").             |

#### Example Prompts

```
Update stablecoin 0.0.123456 with name "Global Dollar" and symbol "GD"
Set metadata for 0.0.123456 to "audit-hash-001"
```

---

### GRANT_ROLE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `DEFAULT_ADMIN_ROLE` on the stablecoin's proxy smart contract.

Grants specialized governance permissions to an account.

#### Parameters

| Parameter  | Type     | Required | Description                                                                                                                                                       |
|------------|----------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID of the stablecoin (e.g., "0.0.123456").                                                                                                              |
| `targetId` | `string` | ✅        | The account ID receiving the role (e.g., "0.0.789012").                                                                                                           |
| `role`     | `enum`   | ✅        | Options: CASHIN_ROLE, BURN_ROLE, WIPE_ROLE, RESCUE_ROLE, PAUSE_ROLE, FREEZE_ROLE, DELETE_ROLE, DEFAULT_ADMIN_ROLE, KYC_ROLE, CUSTOM_FEES_ROLE, HOLD_CREATOR_ROLE. |

#### Example Prompts

```
Grant BURN_ROLE to account 0.0.789012 for stablecoin 0.0.123456
Grant CASHIN_ROLE to account 0.0.789012 for stablecoin 0.0.123456
Assign FREEZE_ROLE to 0.0.111 on token 0.0.222. Proceed immediately.
Give 0.0.555 the HOLD_CREATOR_ROLE permission for stablecoin 0.0.666
```

---

### REVOKE_ROLE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `DEFAULT_ADMIN_ROLE` on the stablecoin's proxy smart contract.

Removes governance permissions from an account.

#### Parameters

| Parameter  | Type     | Required | Description                                          |
|------------|----------|----------|------------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID of the stablecoin (e.g., "0.0.123456"). |
| `targetId` | `string` | ✅        | The account ID to revoke from (e.g., "0.0.789012").  |
| `role`     | `enum`   | ✅        | Options: Same as Grant Role.                         |

#### Example Prompts

```
Revoke BURN_ROLE from account 0.0.789012 for stablecoin 0.0.123456
Remove FREEZE_ROLE from 0.0.111 on token 0.0.222. Proceed immediately.
```

---

### PAUSE_STABLECOIN_TOOL / UNPAUSE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `PAUSE_ROLE` on the stablecoin's proxy smart contract.

Pauses or resumes all token operations globally. When paused, no transfers, mints, or burns can occur.

#### Parameters

| Parameter | Type     | Required | Description                               |
|-----------|----------|----------|-------------------------------------------|
| `tokenId` | `string` | ✅        | The Hedera token ID (e.g., "0.0.123456"). |

#### Example Prompts

```
Pause stablecoin 0.0.123456
Unpause token 0.0.123456. Proceed immediately.
```

---

### DELETE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `DELETE_ROLE` on the stablecoin's proxy smart contract. The token supply must also be zero before deletion is permitted.

Permanently removes the stablecoin from the Hedera network. This action is irreversible.

#### Parameters

| Parameter | Type     | Required | Description                                         |
|-----------|----------|----------|-----------------------------------------------------|
| `tokenId` | `string` | ✅        | The Hedera token ID to delete (e.g., "0.0.123456"). |

#### Example Prompts

```
Delete stablecoin 0.0.123456. Proceed immediately.
```

---

### UPDATE_RESERVE_ADDRESS_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `DEFAULT_ADMIN_ROLE` on the proxy smart contract.

Updates the Proof of Reserve (PoR) contract address linked to the stablecoin.

#### What is `reserveAddress`?

The `reserveAddress` is the Hedera native ID (`shard.realm.num` format) of the **Proof of Reserve smart contract** — not a regular user account. This contract implements a Chainlink-compatible oracle interface and exposes an on-chain `latestRoundData()` function that returns the confirmed reserve balance.

> ⚠️ **EVM hex addresses (`0x...`) are NOT accepted.** The SDK's `ContractId` class explicitly rejects 42-character `0x`-prefixed strings at construction time. Only the Hedera native format `shard.realm.num` is valid (e.g., `0.0.456789`).

> ⚠️ Setting a wrong address does **not** break the token itself, but it invalidates all PoR reporting.

#### Parameters

| Parameter        | Type     | Required | Description                                                                                                 |
|------------------|----------|----------|-------------------------------------------------------------------------------------------------------------|
| `tokenId`        | `string` | ✅        | The token ID of the stablecoin (e.g., "0.0.123456").                                                        |
| `reserveAddress` | `string` | ✅        | The Hedera ID of the PoR contract in `shard.realm.num` format (e.g., "0.0.456789"). **Not** a `0x` address. |

#### Example Prompts

```
Update reserve address to 0.0.456789 for stablecoin 0.0.123456
Update reserve address to 0.0.0 for stablecoin 0.0.123456
```

## Account Tools

### ASSOCIATE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: The account that wants to be associated must sign the transaction. In practice the agent signs on behalf of its operator account. No special role is required — any account can associate themselves with any token.

Associates an account with the token (required to hold/receive tokens).

#### Parameters

| Parameter  | Type     | Required | Description                                       |
|------------|----------|----------|---------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID to associate (e.g., "0.0.123456").   |
| `targetId` | `string` | ✅        | The account ID to associate (e.g., "0.0.789012"). |

#### Example Prompts

```
Associate my account with the stablecoin 0.0.123456. Proceed immediately.
Associate account 0.0.789012 with token 0.0.123456
```

---

### GET_STABLECOIN_BALANCE_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Any account. This is a read-only query — no on-chain role is required.

Checks an account balance in human-readable display units.

#### Parameters

| Parameter  | Type     | Required | Description                                   |
|------------|----------|----------|-----------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID to check (e.g., "0.0.123456").   |
| `targetId` | `string` | ✅        | The account ID to query (e.g., "0.0.789012"). |

#### Example Prompts

```
What is the balance of account 0.0.789012 for stablecoin 0.0.123456?
Check my token balance for 0.0.123456
```

---

### GET_STABLECOIN_CAPABILITIES_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Any account. This is a read-only query — no on-chain role is required.

Checks which governance roles an account currently holds for a given stablecoin.

#### Parameters

| Parameter  | Type     | Required | Description                                          |
|------------|----------|----------|------------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID of the stablecoin (e.g., "0.0.123456"). |
| `targetId` | `string` | ✅        | The account ID to check (e.g., "0.0.789012").        |

#### Example Prompts

```
What capabilities does account 0.0.789012 have for stablecoin 0.0.123456?
Check roles of 0.0.111 on token 0.0.222
```

---

### FREEZE_ACCOUNT_TOOL / UNFREEZE_ACCOUNT_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `FREEZE_ROLE` on the stablecoin's proxy smart contract.

Freezes or unfreezes a specific account's ability to transfer this token. The frozen account's balance is preserved but no transfers in or out are possible.

#### Parameters

| Parameter  | Type     | Required | Description                                             |
|------------|----------|----------|---------------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID (e.g., "0.0.123456").                      |
| `targetId` | `string` | ✅        | The account ID to freeze/unfreeze (e.g., "0.0.789012"). |

#### Example Prompts

```
Freeze account 0.0.789012 for stablecoin 0.0.123456. Proceed immediately.
Unfreeze account 0.0.789012 for stablecoin 0.0.123456. Proceed immediately.
Is account 0.0.789012 frozen for stablecoin 0.0.123456?
```

---

### GRANT_KYC_TOOL / REVOKE_KYC_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `KYC_ROLE` on the stablecoin's proxy smart contract.

Manages the compliance (KYC) flag on an account. Accounts without KYC cannot send or receive this token.

#### Parameters

| Parameter  | Type     | Required | Description                                          |
|------------|----------|----------|------------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID (e.g., "0.0.123456").                   |
| `targetId` | `string` | ✅        | The account ID to grant/revoke (e.g., "0.0.789012"). |

#### Example Prompts

```
Grant KYC to account 0.0.789012 for stablecoin 0.0.123456. Proceed immediately.
Revoke KYC from account 0.0.789012 for stablecoin 0.0.123456. Proceed immediately.
Does account 0.0.789012 have KYC granted for stablecoin 0.0.123456?
```

---

### IS_ACCOUNT_ASSOCIATED_TOOL / IS_ACCOUNT_FROZEN_TOOL / IS_ACCOUNT_KYC_GRANTED_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Any account. These are read-only query tools — no on-chain role is required.

Query tools to check account status before performing operations.

#### Parameters

| Parameter  | Type     | Required | Description                                   |
|------------|----------|----------|-----------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID (e.g., "0.0.123456").            |
| `targetId` | `string` | ✅        | The account ID to query (e.g., "0.0.789012"). |

#### Example Prompts

```
Is account 0.0.789012 associated with stablecoin 0.0.123456?
Is account 0.0.789012 frozen for stablecoin 0.0.123456?
Does account 0.0.789012 have KYC granted for stablecoin 0.0.123456?
```

## Supply Tools

### CASH_IN_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `CASHIN_ROLE` on the stablecoin's proxy smart contract.

Mints new tokens and delivers them to a target account. The new tokens are minted by the smart contract via the HTS System Contract.

#### Parameters

| Parameter   | Type     | Required | Description                                           |
|-------------|----------|----------|-------------------------------------------------------|
| `tokenId`   | `string` | ✅        | The token ID (e.g., "0.0.123456").                    |
| `targetId`  | `string` | ✅        | Account receiving minted tokens (e.g., "0.0.789012"). |
| `amount`    | `string` | ✅        | Amount in display units (e.g., "100.5").              |
| `startDate` | `string` | ❌        | Optional ISO date (e.g., "2026-05-01T12:00:00Z").     |

#### Example Prompts

```
I want to cash in 500 tokens of the stablecoin 0.0.123456 to my account. Proceed immediately.
Mint 100 tokens of stablecoin 0.0.123456 to account 0.0.789012. Proceed immediately.
```

---

### BURN_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `BURN_ROLE` on the stablecoin's proxy smart contract. Tokens are burned from the **treasury account** only — not from arbitrary user accounts.

Burns tokens from the treasury, permanently reducing the total supply.

#### Parameters

| Parameter | Type     | Required | Description                           |
|-----------|----------|----------|---------------------------------------|
| `tokenId` | `string` | ✅        | The token ID (e.g., "0.0.123456").    |
| `amount`  | `string` | ✅        | Amount in display units (e.g., "50"). |

#### Example Prompts

```
I want to burn 100 tokens of the stablecoin 0.0.123456. Proceed immediately.
Burn 50 tokens from treasury of stablecoin 0.0.123456. Proceed immediately.
```

---

### WIPE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `WIPE_ROLE` on the stablecoin's proxy smart contract. Unlike `BURN_ROLE`, this role can remove tokens from **any** account (not just the treasury), making it a compliance/enforcement tool.

Removes tokens from a target user's account without their consent. Used for regulatory enforcement, fraud recovery, or compliance actions.

#### Parameters

| Parameter  | Type     | Required | Description                                |
|------------|----------|----------|--------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID (e.g., "0.0.123456").         |
| `targetId` | `string` | ✅        | Account to wipe from (e.g., "0.0.789012"). |
| `amount`   | `string` | ✅        | Amount in display units (e.g., "25.75").   |

#### Example Prompts

```
Wipe 25 tokens from account 0.0.789012 for stablecoin 0.0.123456. Proceed immediately.
```

---

### RESCUE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
Recovers **stablecoin tokens** that were accidentally sent directly to the proxy smart contract address
(instead of a user account) and transfers them back to the **treasury account**.

**Who can call it**: Only an account holding `RESCUE_ROLE` on the stablecoin smart contract can invoke this
tool. This is a dedicated emergency role — it does not overlap with admin or minting privileges.

> **Why is this needed?** Because the stablecoin is managed by a smart contract proxy, the contract itself
> has an EVM/Hedera address. If tokens are mistakenly transferred to that contract address, they become
> "stuck" inside the contract. This tool recovers them back to the treasury.

#### Parameters

| Parameter | Type     | Required | Description                                                     |
|-----------|----------|----------|-----------------------------------------------------------------|
| `tokenId` | `string` | ✅        | The token ID of the stablecoin (e.g., "0.0.123456").            |
| `amount`  | `string` | ✅        | Amount of tokens to recover in display units (e.g., "100.5").   |

#### Example Prompts

```
Rescue 100 tokens for stablecoin 0.0.123456 from the contract
Recover stuck tokens for 0.0.123456
```

---

### RESCUE_HBAR_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
Recovers **HBAR** (the native Hedera coin) that was accidentally sent to the stablecoin proxy smart
contract address and transfers it to the treasury account.

**Who can call it**: Only an account holding `RESCUE_ROLE` on the stablecoin smart contract. Same role
as `RESCUE_STABLECOIN_TOOL` — no separate HBAR-rescue role exists.

> **Why is this needed?** Like tokens, HBAR can be mistakenly sent to the contract's EVM address and become
> inaccessible without this rescue mechanism.

#### Parameters

| Parameter | Type     | Required | Description                                          |
|-----------|----------|----------|------------------------------------------------------|
| `tokenId` | `string` | ✅        | The token ID of the stablecoin (e.g., "0.0.123456"). |
| `amount`  | `string` | ✅        | Amount of HBAR to recover (e.g., "10.5").            |

#### Example Prompts

```
Rescue 5 HBAR from stablecoin contract 0.0.123456
Recover locked HBAR from the proxy contract of token 0.0.123456
```

---

### CREATE_HOLD_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the account holding `HOLD_CREATOR_ROLE` on the stablecoin's proxy smart contract. This is typically a trusted service or backend agent — not the end-user whose tokens are being held.

The caller specifies a designated **escrow agent** (`escrow` parameter). The escrow agent is the **only** entity that can later execute or release the hold. The creator of the hold and the escrow agent can be the same account or different accounts.

Locks tokens in escrow for a specified account.

#### Parameters

| Parameter        | Type     | Required | Description                                                                         |
|------------------|----------|----------|-------------------------------------------------------------------------------------|
| `tokenId`        | `string` | ✅        | The token ID (e.g., "0.0.123456").                                                  |
| `amount`         | `string` | ✅        | Amount to hold in display units (e.g., "100.5").                                    |
| `escrow`         | `string` | ✅        | Account ID of the escrow agent — the only entity that can execute or release the hold (e.g., "0.0.789012"). |
| `expirationDate` | `string` | ✅        | Unix timestamp (seconds) when the hold expires (e.g., "1713953400").                |
| `accountId`      | `string` | ❌        | The account whose tokens are being held. Defaults to the operator account.          |

#### Example Prompts

```
I want to create a hold of 50 tokens for stablecoin 0.0.123456. The escrow is 0.0.789012 and it expires at 1713953400. Proceed immediately.
```

---

### EXECUTE_HOLD_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the **escrow agent** account specified in `CREATE_HOLD_STABLECOIN_TOOL`. The creator of the hold **cannot** execute it unless they are also the designated escrow agent.

Completes a hold, transferring the locked tokens to the target account.

> **Example**: Alice (with `HOLD_CREATOR_ROLE`) creates a hold locking 100 TUSD from Bob's account, designating PaymentService (0.0.999) as escrow. Only PaymentService can call `EXECUTE_HOLD` — not Alice.

#### Parameters

| Parameter  | Type     | Required | Description                                                                       |
|------------|----------|----------|-----------------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID (e.g., "0.0.123456").                                                |
| `holdId`   | `number` | ✅        | The unique on-chain ID of the hold returned when it was created (e.g., 123).      |
| `amount`   | `string` | ✅        | Amount to execute in display units (e.g., "50.5"). Can be ≤ the held amount.      |
| `sourceId` | `string` | ✅        | The account whose tokens were locked (origin of the hold) (e.g., "0.0.123456").  |
| `targetId` | `string` | ❌        | Destination account for the released tokens. Defaults to the escrow agent itself. |

#### Example Prompts

```
Execute the hold with ID 42 for stablecoin 0.0.123456. The amount is 30, the source is 0.0.111 and the target is 0.0.222. Proceed immediately.
```

---

### RELEASE_HOLD_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: Only the **escrow agent** designated during `CREATE_HOLD_STABLECOIN_TOOL`. After the hold expires, use `RECLAIM_HOLD_STABLECOIN_TOOL` instead.

Cancels a hold and returns the locked tokens to the source account.

#### Parameters

| Parameter  | Type     | Required | Description                                         |
|------------|----------|----------|-----------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID (e.g., "0.0.123456").                  |
| `holdId`   | `number` | ✅        | The unique ID of the hold (e.g., 123).              |
| `amount`   | `string` | ✅        | Amount to release in display units (e.g., "20").    |
| `sourceId` | `string` | ✅        | Account whose tokens are being returned (e.g., "0.0.123456"). |

#### Example Prompts

```
Release the hold with ID 42 for stablecoin 0.0.123456. The amount is 20 and the source is 0.0.111. Proceed immediately.
```

---

### RECLAIM_HOLD_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes
**Who can call it**: **Any account**, but only after the hold's `expirationDate` has passed. No special role is required. Calling this before the hold has expired will fail on-chain.

> **Why open access?** Once a hold expires, the escrow agent has forfeited their exclusive window. Stablecoin Studio allows any party to trigger the reclaim to ensure locked funds are never permanently frozen due to escrow agent inactivity.

Admin recovery of an **expired** hold, returning the locked tokens to the source account.

#### Parameters

| Parameter  | Type     | Required | Description                                                       |
|------------|----------|----------|-------------------------------------------------------------------|
| `tokenId`  | `string` | ✅        | The token ID (e.g., "0.0.123456").                                |
| `holdId`   | `number` | ✅        | The unique ID of the expired hold (e.g., 123).                    |
| `sourceId` | `string` | ✅        | The account to return the locked tokens to (e.g., "0.0.123456"). |

#### Example Prompts

```
Reclaim expired hold with ID 42 for stablecoin 0.0.123456, returning tokens to account 0.0.111. Proceed immediately.
```
