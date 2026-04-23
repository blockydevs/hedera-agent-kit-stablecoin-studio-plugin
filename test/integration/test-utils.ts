import { Client, AccountId, PrivateKey, LedgerId, TokenId, AccountInfoQuery, TokenInfoQuery, Hbar, TokenAssociateTransaction, TransferTransaction } from '@hiero-ledger/sdk';
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
  CreateHoldRequest,
  ReleaseHoldRequest,
  ReclaimHoldRequest,
  CashInRequest,
  PauseRequest,
  BurnRequest,
  WipeRequest,
  GrantRoleRequest,
  RevokeRoleRequest,
  Role,
  StableCoinRole,
  UpdateRequest,
  UpdateReserveAddressRequest,
  CapabilitiesRequest,
  HasRoleRequest,
  StableCoinViewModel,
} from '@hashgraph/stablecoin-npm-sdk';
import { Context, HederaMirrornodeServiceDefaultImpl, HederaBuilder, ExecuteStrategy } from '@hashgraph/hedera-agent-kit';
import { initSdk, connectSdkClientMode, resolveNetwork, StablecoinStudioPluginConfig } from '@/stablecoin-sdk-utils';
import { STABLECOIN_CONFIG_ID, STABLECOIN_CONFIG_VERSION } from '@/constants';

export const MIRROR_NODE_DELAY = 6000;

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

  async transferHbar(params: { to: string; amount: number }) {
    const transaction = new TransferTransaction()
      .addHbarTransfer(this.client.operatorAccountId!, new Hbar(-params.amount))
      .addHbarTransfer(params.to, new Hbar(params.amount));

    const txResponse = await transaction.execute(this.client);
    const receipt = await txResponse.getReceipt(this.client);

    return {
      status: receipt.status.toString(),
      transactionId: txResponse.transactionId.toString(),
    };
  }

  async grantKyc(params: { accountId: string; tokenId: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await initSdk(network, { accountId: this.client.operatorAccountId!.toString() });
    console.log('DEBUG grantKyc connecting with:', this.client.operatorAccountId!.toString());
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

  async waitForKyc(accountId: string, tokenId: string, maxRetries = 5) {
    const network = this.client.ledgerId?.toString() === 'mainnet' ? 'mainnet' : 'testnet';
    const url = `https://${network}.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.tokens && data.tokens.length > 0) {
            const token = data.tokens.find((t: any) => t.token_id === tokenId);
            console.log(`DEBUG waitForKyc account: ${accountId}, token: ${tokenId}, status: ${token?.kyc_status}`);
            if (token && token.kyc_status?.toUpperCase() === 'GRANTED') {
              return true;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to poll mirror node for KYC:', error);
      }
      await wait(2000);
    }
    throw new Error(`Timeout waiting for KYC grant for account ${accountId} and token ${tokenId}`);
  }

  async cashIn(params: { tokenId: string; targetId: string; amount: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });

    await StableCoin.cashIn(
      new CashInRequest({
        tokenId: params.tokenId,
        targetId: params.targetId,
        amount: params.amount,
      })
    );
    return { status: 'SUCCESS' };
  }

  async createHold(params: {
    tokenId: string;
    amount: string;
    escrow: string;
    expirationDate: string;
    targetId?: string;
  }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });

    const result = await StableCoin.createHold(
      new CreateHoldRequest({
        tokenId: params.tokenId,
        amount: params.amount,
        escrow: params.escrow,
        expirationDate: params.expirationDate,
        targetId: params.targetId,
      })
    );

    return {
      status: 'SUCCESS',
      transactionId: result.transactionId?.toString(),
      holdId: result.holdId ? Number(result.holdId.toString()) : undefined,
    };
  }

  async releaseHold(params: {
    tokenId: string;
    holdId: number;
    amount: string;
    sourceId: string;
  }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });

    await StableCoin.releaseHold(
      new ReleaseHoldRequest({
        tokenId: params.tokenId,
        holdId: params.holdId,
        amount: params.amount,
        sourceId: params.sourceId,
      })
    );
    return { status: 'SUCCESS' };
  }

  async reclaimHold(params: { tokenId: string; holdId: number; sourceId: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });

    await StableCoin.reclaimHold(
      new ReclaimHoldRequest({
        tokenId: params.tokenId,
        holdId: params.holdId,
        sourceId: params.sourceId,
      })
    );
    return { status: 'SUCCESS' };
  }

  async updateReserveAddress(params: { tokenId: string; reserveAddress: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });

    const req = new UpdateReserveAddressRequest({
      tokenId: params.tokenId,
      reserveAddress: params.reserveAddress,
    });

    await StableCoin.updateReserveAddress(req);
    return { status: 'SUCCESS' };
  }

  async transfer(params: { tokenId: string; targetId: string; amount: string; senderId?: string }) {
    // We assume 6 decimals as per createStablecoin default
    const amountBase = Math.round(Number(params.amount) * 1000000);
    const tx = new TransferTransaction()
      .addTokenTransfer(params.tokenId, params.senderId || this.client.operatorAccountId!.toString(), -amountBase)
      .addTokenTransfer(params.tokenId, params.targetId, amountBase);

    const txResponse = await tx.execute(this.client);
    await txResponse.getReceipt(this.client);
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

  async freezeAccount(params: { accountId: string; tokenId: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await StableCoin.freeze(new FreezeAccountRequest({
      tokenId: params.tokenId,
      targetId: params.accountId,
    }));
    return { status: 'SUCCESS' };
  }

  async pauseStablecoin(params: { tokenId: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await StableCoin.pause(new PauseRequest({ tokenId: params.tokenId }));
    return { status: 'SUCCESS' };
  }

  async unpauseStablecoin(params: { tokenId: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await StableCoin.unPause(new PauseRequest({ tokenId: params.tokenId }));
    return { status: 'SUCCESS' };
  }

  async grantRole(params: { tokenId: string; targetId: string; role: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await Role.grantRole(new GrantRoleRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      role: (StableCoinRole as any)[params.role],
    }));
    return { status: 'SUCCESS' };
  }

  async revokeRole(params: { tokenId: string; targetId: string; role: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await Role.revokeRole(new RevokeRoleRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      role: (StableCoinRole as any)[params.role],
    }));
    return { status: 'SUCCESS' };
  }

  async wipeStablecoin(params: { tokenId: string; targetId: string; amount: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await StableCoin.wipe(new WipeRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      amount: params.amount,
    }));
    return { status: 'SUCCESS' };
  }

  async burnStablecoin(params: { tokenId: string; amount: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });
    await StableCoin.burn(new BurnRequest({
      tokenId: params.tokenId,
      amount: params.amount,
    }));
    return { status: 'SUCCESS' };
  }

  async updateStablecoin(params: { tokenId: string; name?: string; symbol?: string; memo?: string }) {
    const network = resolveNetwork(this.client, { accountId: this.client.operatorAccountId!.toString() });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });

    const requestConfig: any = { tokenId: params.tokenId };
    if (params.name !== undefined) requestConfig.name = params.name;
    if (params.symbol !== undefined) requestConfig.symbol = params.symbol;
    if (params.memo !== undefined) requestConfig.memo = params.memo;

    const req = new UpdateRequest(requestConfig);
    await StableCoin.update(req);
    return { status: 'SUCCESS' };
  }

  async waitForAssociation(accountId: string, tokenId: string, maxRetries = 5) {
    await wait();
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

  async getStablecoinInfo(tokenId: string): Promise<StableCoinViewModel> {
    return await StableCoin.getInfo(new GetStableCoinDetailsRequest({ id: tokenId }));
  }

  async getStablecoinBalance(accountId: string, tokenId: string) {
    const response = await StableCoin.getBalanceOf(
      new GetAccountBalanceRequest({ targetId: accountId, tokenId }),
    );
    return response.value?.toString() ?? '0';
  }

  async getCapabilities(accountId: string, tokenId: string) {
    const network = resolveNetwork(this.client, {
      accountId: this.client.operatorAccountId!.toString(),
    });
    await initSdk(network, {
      accountId: this.client.operatorAccountId!.toString(),
    });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });

    return await StableCoin.capabilities(
      new CapabilitiesRequest({
        tokenId,
        account: { accountId },
      })
    );
  }

  async hasRole(accountId: string, tokenId: string, role: any) {
    const network = resolveNetwork(this.client, {
      accountId: this.client.operatorAccountId!.toString(),
    });
    await initSdk(network, {
      accountId: this.client.operatorAccountId!.toString(),
    });
    await connectSdkClientMode(network, {
      accountId: this.client.operatorAccountId!.toString(),
      privateKey: this.operatorPrivateKey!.toStringDer(),
    });

    return await Role.hasRole(
      new HasRoleRequest({
        tokenId,
        targetId: accountId,
        role,
      })
    );
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

