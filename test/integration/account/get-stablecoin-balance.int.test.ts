import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  getCustomClient,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import { initSdk, connectSdk, connectSdkClientMode } from '@/stablecoin-sdk-utils';
import getBalanceTool from '@/tools/account/get-stablecoin-balance';
import grantKycTool from '@/tools/account/grant-kyc';
import { CashInRequest, StableCoin } from '@hashgraph/stablecoin-npm-sdk';

describe('Get Stablecoin Balance Integration Tests', () => {
  let operatorClient: Client;
  let executorClient: Client;
  let operatorWrapper: HederaOperationsWrapper;
  let executorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;

  const initialSupply = '1000'; // 1000 tokens (display units)
  const initialSupplyBase = '1000000000'; // 1000 * 10^6

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    operatorClient = getOperatorClientForTests();
    operatorWrapper = new HederaOperationsWrapper(
      operatorClient,
      PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY || '')
    );

    // Create executor account
    const executorKey = PrivateKey.generateECDSA();
    const executorAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Get Balance Integration Tests',
      })
      .then((resp) => resp.accountId!);

    await operatorWrapper.waitForAccount(executorAccountId.toString());

    executorClient = getCustomClient(executorAccountId, executorKey);
    executorWrapper = new HederaOperationsWrapper(
      executorClient,
      PrivateKey.fromStringECDSA(executorKey.toString())
    );

    context = {
      mode: AgentMode.AUTONOMOUS,
      accountId: executorAccountId.toString(),
    };

    config = {
      accountId: executorAccountId.toString(),
      privateKey: executorKey.toStringDer(),
    };

    const network = 'testnet';
    await initSdk(network, config);
    await connectSdk(network, config, context);

    // 1. Create a stablecoin
    tokenId = await executorWrapper.createStablecoin({
      name: `Balance Test Token ${Date.now()}`,
      symbol: 'BTT',
      config,
      context,
    });

    // 2. Associate token with executor
    // The executor needs to be associated before it can receive tokens via cashIn.
    // We use the executorWrapper which already has the correct key set up.
    await executorWrapper.associateToken({
      accountId: executorAccountId.toString(),
      tokenId,
      privateKey: executorKey,
    }).catch(() => {});

    // wait for association to be indexed
    await executorWrapper.waitForAssociation(executorAccountId.toString(), tokenId);

    // 3. Grant KYC to executor (token has a kycKey, so KYC is required before receiving tokens)
    const grantKyc = grantKycTool(context, config);
    await grantKyc.execute(executorClient, context, {
      tokenId,
      targetId: executorAccountId.toString(),
    });
    await wait();

    // 4. Reconnect with CLIENT mode so StableCoin.cashIn() can execute directly
    await connectSdkClientMode('testnet', config);

    // 5. Cash-in (mint) tokens to the executor
    await StableCoin.cashIn(
      new CashInRequest({
        tokenId,
        targetId: executorAccountId.toString(),
        amount: initialSupply,
      })
    );

    await wait();
  }, 120000);

  afterAll(async () => {
    if (executorClient && operatorClient) {
      try {
        await executorWrapper.deleteAccount({
          accountId: executorClient.operatorAccountId!,
          transferAccountId: operatorClient.operatorAccountId!,
        });
      } catch (error) {
        console.warn('Failed to clean up executor account:', error);
      }
      executorClient.close();
    }
    if (operatorClient) {
      operatorClient.close();
    }
  });

  it('should return the correct balance for the creator account in display units', async () => {
    const tool = getBalanceTool(context, config);

    const params = {
      tokenId,
      targetId: context.accountId!,
    };

    const result: any = await tool.execute(executorClient, context, params);

    expect(result.humanMessage).toContain(`Balance of token ${tokenId}`);
    expect(result.humanMessage).toContain(initialSupply);
    expect(result.raw.balance.toString()).toBe(initialSupply);
    expect(result.raw.balanceRaw.toString()).toBe(initialSupplyBase);
  });
});
