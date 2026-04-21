import { Client, AccountId, PrivateKey, LedgerId, TokenId, AccountInfoQuery, TokenInfoQuery, Hbar, TokenAssociateTransaction, TokenGrantKycTransaction, TokenUnfreezeTransaction } from '@hiero-ledger/sdk';
import { z } from 'zod';
import {
  StableCoin,
  GetStableCoinDetailsRequest,
  GetAccountBalanceRequest,
  CreateRequest,
  TokenSupplyType,
  Account,
  KYCRequest,
  FreezeAccountRequest,
} from '@hashgraph/stablecoin-npm-sdk';
import { Context, HederaMirrornodeServiceDefaultImpl, HederaBuilder, ExecuteStrategy } from '@hashgraph/hedera-agent-kit';
import { initSdk, connectSdkClientMode, resolveNetwork, StablecoinStudioPluginConfig } from '@/stablecoin-sdk-utils';
import { STABLECOIN_CONFIG_ID, STABLECOIN_CONFIG_VERSION } from '@/constants';

export const MIRROR_NODE_DELAY = 4000;

export const wait = (ms: number = MIRROR_NODE_DELAY) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const envSchema = z.object({
  ACCOUNT_ID: z.string().regex(/^0\.0\.[0-9]+$/),
  PRIVATE_KEY: z.string(),
});

export const getOperatorClientForTests = (): Client => {
  const env = envSchema.parse({
    ACCOUNT_ID: process.env.ACCOUNT_ID,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
  });

  const operatorAccountId = AccountId.fromString(env.ACCOUNT_ID);
  const privateKey = PrivateKey.fromStringDer(env.PRIVATE_KEY);

  return Client.forTestnet().setOperator(operatorAccountId, privateKey);
};

export const getCustomClient = (accountId: AccountId, privateKey: PrivateKey): Client => {
  return Client.forTestnet().setOperator(accountId, privateKey);
};

export const BALANCE_TIERS = {
  MINIMAL: 0.5,
  STANDARD: 5,
  ELEVATED: 10,
  MAXIMUM: 20,
} as const;

export class UsdToHbarService {
  private static exchangeRate: number | null = null;

  static async initialize(): Promise<void> {
    if (this.exchangeRate !== null) return;
    try {
      const mirrornode = new HederaMirrornodeServiceDefaultImpl(LedgerId.TESTNET);
      const resp = await mirrornode.getExchangeRate();
      const currentRate = resp.current_rate;
      this.exchangeRate = currentRate.cent_equivalent / currentRate.hbar_equivalent / 100;
    } catch (_error) {
      console.warn('Failed to fetch exchange rate, using default 0.1 USD/HBAR');
      this.exchangeRate = 0.1;
    }
  }

  static usdToHbar(usdAmount: number): number {
    if (this.exchangeRate === null) {
      return usdAmount / 0.1; // Default fallback
    }
    const hbarAmount = usdAmount / this.exchangeRate;
    return Math.round(hbarAmount * 1e8) / 1e8;
  }
}

export class HederaOperationsWrapper {
  private executeStrategy = new ExecuteStrategy();
  private mirrornode: HederaMirrornodeServiceDefaultImpl;

  constructor(private client: Client, private operatorPrivateKey?: PrivateKey) {
    this.mirrornode = new HederaMirrornodeServiceDefaultImpl(LedgerId.TESTNET);
    this.client.setDefaultMaxTransactionFee(new Hbar(20));
  }

  async createAccount(params: { key: any; initialBalance?: number; accountMemo?: string }) {
    const tx = HederaBuilder.createAccount({
      key: params.key,
      initialBalance: params.initialBalance || 0,
      accountMemo: params.accountMemo || '',
    } as any);

    const result = await this.executeStrategy.handle(tx, this.client, {});
    return {
      status: result.raw.status,
      accountId: result.raw.accountId,
      transactionId: result.raw.transactionId,
    };
  }

  async deleteAccount(params: { accountId: AccountId; transferAccountId: AccountId }) {
    const tx = HederaBuilder.deleteAccount({
      accountId: params.accountId,
      transferAccountId: params.transferAccountId,
    });

    const result = await this.executeStrategy.handle(tx, this.client, {});
    return {
      status: result.raw.status,
      transactionId: result.raw.transactionId,
    };
  }

  async associateToken(params: { accountId: string; tokenId: string; privateKey?: PrivateKey }) {
    const transaction = new TokenAssociateTransaction()
      .setAccountId(params.accountId)
      .setTokenIds([params.tokenId]);

    if (params.privateKey) {
      await transaction.freezeWith(this.client);
      await transaction.sign(params.privateKey);
    }

    const txResponse = await transaction.execute(this.client);
    const receipt = await txResponse.getReceipt(this.client);

    return {
      status: receipt.status.toString(),
      transactionId: txResponse.transactionId.toString(),
    };
  }

  async grantKyc(params: { accountId: string; tokenId: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await StableCoin.grantKyc(new KYCRequest({
      tokenId: params.tokenId,
      targetId: params.accountId,
    }));
    return { status: 'SUCCESS' };
  }

  async unfreeze(params: { accountId: string; tokenId: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await StableCoin.unFreeze(new FreezeAccountRequest({
      tokenId: params.tokenId,
      targetId: params.accountId,
    }));
    return { status: 'SUCCESS' };
  }

  async waitForAssociation(accountId: string, tokenId: string, maxRetries = 30) {
    const network = this.client.ledgerId?.isMainnet() ? 'mainnet' : 'testnet';
    const url = `https://${network}.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.tokens && data.tokens.length > 0) {
            return true;
          }
        }
      } catch (_e) {
        // Ignore errors and retry
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    await new Promise((r) => setTimeout(r, 4000));
    throw new Error(`Timeout waiting for mirror node association between ${accountId} and ${tokenId}`);
  }

  async waitForKyc(accountId: string, tokenId: string, maxRetries = 60) {
    const network = this.client.ledgerId?.isMainnet() ? 'mainnet' : 'testnet';
    const url = `https://${network}.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.tokens && data.tokens.length > 0) {
            const token = data.tokens.find((t: any) => t.token_id === tokenId);
            if (token && token.kyc_status === 'GRANTED') {
              return true;
            }
          }
        }
      } catch (_e) {
        // Ignore errors and retry
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    await new Promise((r) => setTimeout(r, 4000));
    throw new Error(`Timeout waiting for mirror node KYC grant for ${accountId} and ${tokenId}`);
  }

  async getAccountInfo(accountId: string) {
    const query = new AccountInfoQuery().setAccountId(AccountId.fromString(accountId));
    return await query.execute(this.client);
  }

  async getTokenInfo(tokenId: string) {
    const query = new TokenInfoQuery().setTokenId(TokenId.fromString(tokenId));
    return await query.execute(this.client);
  }

  async getAccountBalances(accountId: string) {
    const response = await this.mirrornode.getAccount(accountId);
    return response.balance;
  }

  async waitForAccount(accountId: string, maxAttempts: number = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.mirrornode.getAccount(accountId);
        return;
      } catch (e) {
        if (i === maxAttempts - 1) throw e;
        await wait(MIRROR_NODE_DELAY);
      }
    }
  }

  async getStablecoinInfo(tokenId: string) {
    return await StableCoin.getInfo(new GetStableCoinDetailsRequest({ id: tokenId }));
  }

  async getStablecoinBalance(accountId: string, tokenId: string) {
    const response = await StableCoin.getBalanceOf(
      new GetAccountBalanceRequest({ targetId: accountId, tokenId }),
    );
    return response.value?.toString() ?? '0';
  }

  async isTokenAssociated(accountId: string, tokenId: string): Promise<boolean> {
    try {
      const balances = await this.mirrornode.getAccountTokenBalances(accountId, tokenId);
      return balances.tokens.some((t) => t.token_id === tokenId);
    } catch (_e) {
      return false;
    }
  }

  async getLatestTokenId(accountId: string, name?: string): Promise<string> {
    const networkName = this.client.ledgerId || LedgerId.TESTNET;

    // 1. Try to fetch token balances for the account
    try {
      const balances = await this.mirrornode.getAccountTokenBalances(accountId);
      if (name) {
        // Find by name in associated tokens
        for (const token of balances.tokens) {
          try {
            const info = await this.mirrornode.getTokenInfo(token.token_id);
            if (info.name === name) return token.token_id;
          } catch (_e) {
            // Ignore errors
          }
        }
      } else if (balances.tokens.length > 0) {
        // Return newest one
        return balances.tokens[0].token_id;
      }
    } catch (e) {
      console.log(`Failed to fetch balances for ${accountId}: ${e}`);
    }

    // 2. Fallback to name search via direct fetch (since service doesn't have it)
    if (name) {
      try {
        const response = await fetch(
          `https://${networkName}.mirrornode.hedera.com/api/v1/tokens?name=${encodeURIComponent(name)}&order=desc&limit=5`
        );
        const data = await response.json();
        if (data.tokens && data.tokens.length > 0) {
          // Return the first one that matches
          const token = data.tokens.find((t: any) => t.name === name);
          if (token) return token.token_id;
        }
      } catch (error) {
        console.log(`Failed to fetch token from mirrornode directly: ${error}`);
      }
    }

    throw new Error(`Token not found for account ${accountId}${name ? ` with name ${name}` : ''}`);
  }

  async createStablecoin(params: {
    name: string;
    symbol: string;
    config: Partial<StablecoinStudioPluginConfig>;
    context: Context;
  }): Promise<string> {
    const operatorId = this.client.operatorAccountId?.toString();
    const network = resolveNetwork(this.client, params.config as StablecoinStudioPluginConfig);

    const fullConfig: StablecoinStudioPluginConfig = {
      accountId: params.config.accountId || operatorId || '',
      privateKey: params.config.privateKey || this.operatorPrivateKey?.toString(),
      network: params.config.network || network,
      ...params.config,
    };

    if (!fullConfig.accountId) {
      throw new Error('AccountId is required for stablecoin creation');
    }

    console.log(`Creating stablecoin ${params.name} on network ${network} with account ${fullConfig.accountId}`);

    await initSdk(network, fullConfig);
    await connectSdkClientMode(network, fullConfig);

    const request = new CreateRequest({
      name: params.name,
      symbol: params.symbol,
      decimals: 6,
      initialSupply: '0',
      supplyType: TokenSupplyType.INFINITE,
      createReserve: false,
      proxyOwnerAccount: fullConfig.accountId,
      burnRoleAccount: fullConfig.accountId,
      wipeRoleAccount: fullConfig.accountId,
      rescueRoleAccount: fullConfig.accountId,
      pauseRoleAccount: fullConfig.accountId,
      freezeRoleAccount: fullConfig.accountId,
      deleteRoleAccount: fullConfig.accountId,
      kycRoleAccount: fullConfig.accountId,
      cashInRoleAccount: fullConfig.accountId,
      feeRoleAccount: fullConfig.accountId,
      freezeKey: Account.NullPublicKey,
      wipeKey: Account.NullPublicKey,
      pauseKey: Account.NullPublicKey,
      kycKey: Account.NullPublicKey,
      configId: STABLECOIN_CONFIG_ID,
      configVersion: STABLECOIN_CONFIG_VERSION,
    });

    const result = await StableCoin.create(request);
    const tokenId = result.coin.tokenId?.toString();

    if (tokenId && tokenId !== '0.0.0') {
      console.log(`Token ${params.name} created with ID: ${tokenId}`);
      return tokenId;
    }

    throw new Error(`Failed to create token ${params.name}: no tokenId found in SDK response`);
  }
}

