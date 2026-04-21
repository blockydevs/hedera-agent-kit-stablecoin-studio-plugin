# Hedera Agent Kit - Stablecoin Studio Plugin

This plugin enables the [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit) to interact with [Stablecoin Studio](https://github.com/hashgraph/stablecoin-studio), providing an agentic toolkit for lifecycle management, supply operations, and account-level interactions for stablecoins on the Hedera network.

## Prerequisites

- **Hedera Account**: You need a Hedera account (Testnet or Mainnet).
- **Private Key**: The plugin specifically requires an **ECDSA** private key. This is necessary for compatibility with the Stablecoin Studio smart contracts and EVM operations.
    - Supported formats: DER-encoded hex, raw hex, or 0x-prefixed hex.

## Installation

```bash
npm install @hashgraph/hedera-agent-kit-stablecoin-studio-plugin
```

## Usage

Initialize the plugin with your account details and add it to your Hedera Agent Kit instance.

```typescript
import { createStablecoinStudioPlugin } from '@hashgraph/hedera-agent-kit-stablecoin-studio-plugin';
import { HederaAgentKit } from '@hashgraph/hedera-agent-kit';

const plugin = createStablecoinStudioPlugin({
  accountId: process.env.ACCOUNT_ID,
  privateKey: process.env.PRIVATE_KEY, // Must be an ECDSA key
});

const agent = new HederaAgentKit({
  // ... agent config
  plugins: [plugin],
});
```

## Tools

The plugin provides several tools categorized into:

### Lifecycle
- **Create Stablecoin**: Deploy a new stablecoin.
- **Delete Stablecoin**: Delete an existing stablecoin instance.
- **Update Stablecoin**: Update stablecoin metadata.
- **Get Stablecoin Info**: Retrieve detailed information about a stablecoin.
- **Pause/Unpause**: Halt or resume token operations.

### Supply
- **Cash-in (Mint)**: Create new tokens.
- **Burn**: Destroy tokens from the treasury.
- **Wipe**: Remove tokens from a specific account.
- **Rescue**: Recover tokens/HBAR from the contract.

### Account
- **Associate**: Link an account to a token.
- **Get Balance**: Check token balance for an account.
- **Is Associated**: check if an account is associated with a token.
