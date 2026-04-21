# Hedera Agent Kit Stablecoin Studio Plugin Tools

This document describes all the tools available in the Hedera Agent Kit Stablecoin Studio Plugin for managing stablecoins on the Hedera network.

## Lifecycle Tools

### GET_STABLECOIN_INFO_TOOL

**Supports Hooks & Policies**: ✅ Yes

Retrieves detailed information about a stablecoin managed by Stablecoin Studio on the Hedera network. Supply values are returned in display units (human-readable).

#### Parameters

| Parameter | Type   | Required | Description                                                                 |
|-----------|--------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin to query (e.g., "0.0.123456"). |

#### Example Prompts

```
Get information about stablecoin 0.0.123456
Show details for token 0.0.123456
What is the info for stablecoin 0.0.123456?
```

---

### CREATE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Creates a new stablecoin on Hedera using Stablecoin Studio.

#### Parameters

| Parameter              | Type     | Required | Default              | Description                                                                 |
|------------------------|----------|----------|----------------------|-----------------------------------------------------------------------------|
| `name`                 | `string` | ✅       | -                    | The name of the stablecoin (e.g., "USD Coin").                             |
| `symbol`               | `string` | ✅       | -                    | The token symbol (e.g., "USDC").                                           |
| `decimals`             | `number` | ❌       | `6`                  | Number of decimal places (0-18).                                           |
| `initialSupply`        | `string` | ❌       | `"0"`                | Initial token supply in display units (e.g. "100.5").                      |
| `maxSupply`            | `string` | ❌       | -                    | Maximum token supply in display units (e.g. "1000"). Only for FINITE type. |
| `supplyType`           | `enum`   | ❌       | `"INFINITE"`         | Supply type: "FINITE" or "INFINITE".                                       |
| `createReserve`        | `boolean`| ❌       | `false`              | Whether to create a proof of reserve.                                      |
| `proxyOwnerAccount`    | `string` | ❌       | operator account     | Account ID for proxy owner.                                                 |
| `burnRoleAccount`      | `string` | ❌       | operator account     | Account ID for burn role.                                                  |
| `wipeRoleAccount`      | `string` | ❌       | operator account     | Account ID for wipe role.                                                  |
| `rescueRoleAccount`    | `string` | ❌       | operator account     | Account ID for rescue role.                                                |
| `pauseRoleAccount`     | `string` | ❌       | operator account     | Account ID for pause role.                                                 |
| `freezeRoleAccount`    | `string` | ❌       | operator account     | Account ID for freeze role.                                                |
| `deleteRoleAccount`    | `string` | ❌       | operator account     | Account ID for delete role.                                                |
| `kycRoleAccount`       | `string` | ❌       | operator account     | Account ID for KYC role.                                                   |
| `cashInRoleAccount`    | `string` | ❌       | operator account     | Account ID for cash-in role.                                               |
| `feeRoleAccount`       | `string` | ❌       | operator account     | Account ID for fee role.                                                   |

#### Example Prompts

```
Create a new stablecoin named "USD Coin" with symbol "USDC"
Create stablecoin "Euro Stable" symbol "EURC" with 2 decimals and initial supply 1000
Create finite supply stablecoin "Test Coin" symbol "TEST" max supply 10000
```

---

### UPDATE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Updates the metadata of an existing stablecoin on the Hedera network. Only the admin key holder can update a stablecoin.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin to update (e.g., "0.0.123456").      |
| `name`    | `string` | ❌       | New name for the stablecoin.                                               |
| `symbol`  | `string` | ❌       | New symbol for the stablecoin.                                             |
| `memo`    | `string` | ❌       | New memo for the stablecoin (max 100 characters).                          |

#### Example Prompts

```
Update stablecoin 0.0.123456 name to "New USD Coin"
Change symbol of token 0.0.123456 to "NUSDC"
Update memo for stablecoin 0.0.123456 to "Updated description"
```

---

### PAUSE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Pauses a stablecoin, halting all token operations. Requires the pause role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |

#### Example Prompts

```
Pause stablecoin 0.0.123456
Halt operations for token 0.0.123456
```

---

### UNPAUSE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Unpauses a stablecoin, resuming token operations. Requires the pause role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |

#### Example Prompts

```
Unpause stablecoin 0.0.123456
Resume operations for token 0.0.123456
```

---

### DELETE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Deletes a stablecoin from the Hedera network. This action is irreversible. Requires the delete role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin to delete (e.g., "0.0.123456").      |

#### Example Prompts

```
Delete stablecoin 0.0.123456
Remove token 0.0.123456 permanently
```

---

### GRANT_ROLE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Grants a specific role (permission) to an account for a stablecoin on the Hedera network. Requires the admin role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to receive the role (e.g., "0.0.789012").            |
| `role`    | `enum`   | ✅       | The role to grant. Options: CASHIN_ROLE, BURN_ROLE, WIPE_ROLE, RESCUE_ROLE, PAUSE_ROLE, FREEZE_ROLE, DELETE_ROLE, DEFAULT_ADMIN_ROLE, KYC_ROLE, CUSTOM_FEES_ROLE, HOLD_CREATOR_ROLE. |

#### Example Prompts

```
Grant CASHIN_ROLE to account 0.0.789012 for stablecoin 0.0.123456
Give BURN_ROLE permission to 0.0.789012 on token 0.0.123456
Assign KYC_ROLE to account 0.0.789012 for stablecoin 0.0.123456
```

---

### REVOKE_ROLE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Revokes a specific role (permission) from an account for a stablecoin on the Hedera network. Requires the admin role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to revoke the role from (e.g., "0.0.789012").        |
| `role`    | `enum`   | ✅       | The role to revoke. Options: CASHIN_ROLE, BURN_ROLE, WIPE_ROLE, RESCUE_ROLE, PAUSE_ROLE, FREEZE_ROLE, DELETE_ROLE, DEFAULT_ADMIN_ROLE, KYC_ROLE, CUSTOM_FEES_ROLE, HOLD_CREATOR_ROLE. |

#### Example Prompts

```
Revoke CASHIN_ROLE from account 0.0.789012 for stablecoin 0.0.123456
Remove BURN_ROLE permission from 0.0.789012 on token 0.0.123456
Take away KYC_ROLE from account 0.0.789012 for stablecoin 0.0.123456
```

---

### UPDATE_RESERVE_ADDRESS_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Updates the reserve address for a stablecoin's proof of reserve.

#### Parameters

| Parameter     | Type     | Required | Description                                                                 |
|---------------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId`     | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `reserveAddress`| `string`| ✅       | The new reserve address.                                                    |

#### Example Prompts

```
Update reserve address for stablecoin 0.0.123456 to 0.0.789012
Change proof of reserve address for token 0.0.123456
```

## Account Tools

### ASSOCIATE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Associates a stablecoin token with a Hedera account. An account must be associated with a token before it can hold or receive that token.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to associate with the token (e.g., "0.0.789012").    |

#### Example Prompts

```
Associate account 0.0.789012 with stablecoin 0.0.123456
Link token 0.0.123456 to account 0.0.789012
```

---

### GET_STABLECOIN_BALANCE_TOOL

**Supports Hooks & Policies**: ✅ Yes

Returns the balance of a stablecoin for a specific account on the Hedera network. Result is returned in display units (human-readable).

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to check the balance for (e.g., "0.0.789012").       |

#### Example Prompts

```
Check balance of stablecoin 0.0.123456 for account 0.0.789012
How many tokens does 0.0.789012 have of 0.0.123456?
Get balance for account 0.0.789012 on token 0.0.123456
```

---

### GET_STABLECOIN_CAPABILITIES_TOOL

**Supports Hooks & Policies**: ✅ Yes

Returns the capabilities (roles) of an account for a specific stablecoin.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to check capabilities for (e.g., "0.0.789012").      |

#### Example Prompts

```
What roles does account 0.0.789012 have for stablecoin 0.0.123456?
Check capabilities of 0.0.789012 on token 0.0.123456
Get permissions for account 0.0.789012 regarding 0.0.123456
```

---

### FREEZE_ACCOUNT_TOOL

**Supports Hooks & Policies**: ✅ Yes

Freezes a specific account for a stablecoin on the Hedera network, preventing it from transferring or receiving the token. Requires the freeze role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to freeze (e.g., "0.0.789012").                      |

#### Example Prompts

```
Freeze account 0.0.789012 for stablecoin 0.0.123456
Lock token transfers for 0.0.789012 on 0.0.123456
```

---

### UNFREEZE_ACCOUNT_TOOL

**Supports Hooks & Policies**: ✅ Yes

Unfreezes a specific account for a stablecoin on the Hedera network, allowing it to transfer and receive the token again. Requires the freeze role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to unfreeze (e.g., "0.0.789012").                    |

#### Example Prompts

```
Unfreeze account 0.0.789012 for stablecoin 0.0.123456
Unlock token transfers for 0.0.789012 on 0.0.123456
```

---

### GRANT_KYC_TOOL

**Supports Hooks & Policies**: ✅ Yes

Grants KYC status to a specific account for a stablecoin. Requires the KYC role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to grant KYC to (e.g., "0.0.789012").                |

#### Example Prompts

```
Grant KYC to account 0.0.789012 for stablecoin 0.0.123456
Approve KYC status for 0.0.789012 on token 0.0.123456
```

---

### REVOKE_KYC_TOOL

**Supports Hooks & Policies**: ✅ Yes

Revokes KYC status from a specific account for a stablecoin. Requires the KYC role.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to revoke KYC from (e.g., "0.0.789012").             |

#### Example Prompts

```
Revoke KYC from account 0.0.789012 for stablecoin 0.0.123456
Remove KYC status for 0.0.789012 on token 0.0.123456
```

---

### IS_ACCOUNT_ASSOCIATED_TOOL

**Supports Hooks & Policies**: ✅ Yes

Checks if a specific account is associated with a stablecoin.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to check (e.g., "0.0.789012").                       |

#### Example Prompts

```
Is account 0.0.789012 associated with stablecoin 0.0.123456?
Check if 0.0.789012 is linked to token 0.0.123456
```

---

### IS_ACCOUNT_FROZEN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Checks if a specific account is currently frozen for a given stablecoin.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to check (e.g., "0.0.789012").                       |

#### Example Prompts

```
Is account 0.0.789012 frozen for stablecoin 0.0.123456?
Check freeze status of 0.0.789012 on token 0.0.123456
```

---

### IS_ACCOUNT_KYC_GRANTED_TOOL

**Supports Hooks & Policies**: ✅ Yes

Checks if a specific account has KYC granted for a given stablecoin.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId`| `string` | ✅       | The Hedera account ID to check (e.g., "0.0.789012").                       |

#### Example Prompts

```
Does account 0.0.789012 have KYC for stablecoin 0.0.123456?
Check KYC status of 0.0.789012 on token 0.0.123456
```

## Supply Tools

### TRANSFER_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Transfers stablecoin tokens from one account to another on the Hedera network.

#### Parameters

| Parameter  | Type     | Required | Description                                                                 |
|------------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `senderId` | `string` | ✅       | The Hedera account ID sending the tokens (e.g., "0.0.789012").             |
| `receiverId`| `string`| ✅       | The Hedera account ID receiving the tokens (e.g., "0.0.345678").           |
| `amount`   | `string` | ✅       | The amount of tokens to transfer in display units (e.g. "100.5").          |

#### Example Prompts

```
Transfer 100.5 tokens from 0.0.789012 to 0.0.345678 for stablecoin 0.0.123456
Send 50 tokens of 0.0.123456 from account 0.0.789012 to 0.0.345678
Move 25.75 units from 0.0.789012 to 0.0.345678 on token 0.0.123456
```

---

### CASH_IN_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Mints (cash-in) new stablecoin tokens to a target account on the Hedera network. Requires the cash-in role.

#### Parameters

| Parameter  | Type     | Required | Description                                                                 |
|------------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId` | `string` | ✅       | The Hedera account ID to receive the minted tokens (e.g., "0.0.789012").   |
| `amount`   | `string` | ✅       | The amount of tokens to mint in display units (e.g., "100.5").             |
| `startDate`| `string` | ❌       | ISO 8601 date for scheduling the operation.                                |

#### Example Prompts

```
Mint 1000 new tokens to account 0.0.789012 for stablecoin 0.0.123456
Cash in 500.25 tokens for 0.0.789012 on 0.0.123456
Create 200 tokens and send to 0.0.789012 for token 0.0.123456
```

---

### BURN_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Burns (destroys) a specified amount of stablecoin tokens from the treasury account. Requires the burn role.

#### Parameters

| Parameter  | Type     | Required | Description                                                                 |
|------------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `amount`   | `string` | ✅       | The amount of tokens to burn in display units (e.g., "100.5").             |
| `startDate`| `string` | ❌       | ISO 8601 date for scheduling the operation.                                |

#### Example Prompts

```
Burn 100 tokens from treasury of stablecoin 0.0.123456
Destroy 50.5 tokens for token 0.0.123456
Reduce supply by 200 units for 0.0.123456
```

---

### WIPE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Wipes (removes) a specified amount of stablecoin tokens from a target account. Requires the wipe role.

#### Parameters

| Parameter  | Type     | Required | Description                                                                 |
|------------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId` | `string` | ✅       | The Hedera account ID to wipe tokens from (e.g., "0.0.789012").            |
| `amount`   | `string` | ✅       | The amount of tokens to wipe in display units (e.g., "100.5").             |

#### Example Prompts

```
Wipe 50 tokens from account 0.0.789012 for stablecoin 0.0.123456
Remove 25.75 tokens from 0.0.789012 on 0.0.123456
Confiscate 100 units from account 0.0.789012 for token 0.0.123456
```

---

### RESCUE_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Rescues stablecoin tokens from the contract to a specified account. Requires the rescue role.

#### Parameters

| Parameter  | Type     | Required | Description                                                                 |
|------------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId` | `string` | ✅       | The Hedera account ID to receive rescued tokens (e.g., "0.0.789012").      |
| `amount`   | `string` | ✅       | The amount of tokens to rescue in display units (e.g., "100.5").           |

#### Example Prompts

```
Rescue 100 tokens from contract to account 0.0.789012 for stablecoin 0.0.123456
Recover 50.5 tokens to 0.0.789012 on 0.0.123456
Extract 200 units from contract for token 0.0.123456 to 0.0.789012
```

---

### RESCUE_HBAR_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Rescues HBAR from the stablecoin contract to a specified account. Requires the rescue role.

#### Parameters

| Parameter  | Type     | Required | Description                                                                 |
|------------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `targetId` | `string` | ✅       | The Hedera account ID to receive rescued HBAR (e.g., "0.0.789012").        |
| `amount`   | `string` | ✅       | The amount of HBAR to rescue (e.g., "10.5").                               |

#### Example Prompts

```
Rescue 10 HBAR from stablecoin 0.0.123456 contract to account 0.0.789012
Recover 5.5 HBAR to 0.0.789012 from token 0.0.123456
Extract 20 HBAR from contract for 0.0.123456 to 0.0.789012
```

---

### CREATE_HOLD_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Creates a hold on stablecoin tokens for a specific account. Requires the hold creator role.

#### Parameters

| Parameter  | Type     | Required | Description                                                                 |
|------------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId`  | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `accountId`| `string` | ✅       | The Hedera account ID for the hold (e.g., "0.0.789012").                   |
| `amount`   | `string` | ✅       | The amount of tokens to hold in display units (e.g., "100.5").             |

#### Example Prompts

```
Create a hold of 100 tokens for account 0.0.789012 on stablecoin 0.0.123456
Hold 50.5 tokens for 0.0.789012 on 0.0.123456
Lock 200 units for account 0.0.789012 on token 0.0.123456
```

---

### EXECUTE_HOLD_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Executes a previously created hold on stablecoin tokens.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `holdId`  | `string` | ✅       | The ID of the hold to execute.                                              |

#### Example Prompts

```
Execute hold with ID 12345 for stablecoin 0.0.123456
Process hold 12345 on token 0.0.123456
Complete the hold operation for 0.0.123456 hold ID 12345
```

---

### RELEASE_HOLD_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Releases a hold on stablecoin tokens, making them available again.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `holdId`  | `string` | ✅       | The ID of the hold to release.                                              |

#### Example Prompts

```
Release hold with ID 12345 for stablecoin 0.0.123456
Unlock hold 12345 on token 0.0.123456
Free the tokens in hold 12345 for 0.0.123456
```

---

### RECLAIM_HOLD_STABLECOIN_TOOL

**Supports Hooks & Policies**: ✅ Yes

Reclaims a hold on stablecoin tokens back to the treasury.

#### Parameters

| Parameter | Type     | Required | Description                                                                 |
|-----------|----------|----------|-----------------------------------------------------------------------------|
| `tokenId` | `string` | ✅       | The Hedera token ID of the stablecoin (e.g., "0.0.123456").                |
| `holdId`  | `string` | ✅       | The ID of the hold to reclaim.                                              |

#### Example Prompts

```
Reclaim hold with ID 12345 for stablecoin 0.0.123456
Take back hold 12345 on token 0.0.123456
Return tokens from hold 12345 to treasury for 0.0.123456
```
