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
import createHoldTool from '@/tools/supply/create-hold';
import releaseHoldTool from '@/tools/supply/release-hold';
import associateTool from '@/tools/account/associate-stablecoin';
import { CashInRequest, StableCoin } from '@hashgraph/stablecoin-npm-sdk';

describe('Hold Release Operations Integration Tests', () => {
  let operatorClient: Client;
  let executorClient: Client;
  let operatorWrapper: HederaOperationsWrapper;
  let executorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;

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
        accountMemo: 'executor account for Hold Release Integration Tests',
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

    // 1. Create a stablecoin
    tokenId = await executorWrapper.createStablecoin({
      name: `Hold Test ${Date.now()}`,
      symbol: 'RHT',
      config,
      context,
    });

    // 2. Associate the executor account
    const associate = associateTool(context, config);
    await associate.execute(executorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });

    // wait for association to be indexed
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);

    // Grant KYC to executor (token has a kycKey, so KYC is required before receiving tokens)
    await executorWrapper.grantKyc({
      accountId: context.accountId!,
      tokenId,
    });
    
    // wait for KYC to be indexed
    await executorWrapper.waitForKyc(context.accountId!, tokenId);

    // 3. Mint tokens to executor
    await StableCoin.cashIn(
      new CashInRequest({
        tokenId,
        targetId: executorAccountId.toString(),
        amount: '100',
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

  it('should create and release a hold', async () => {
    const createHold = createHoldTool(context, config);
    const releaseHold = releaseHoldTool(context, config);

    // 1. Check initial balance
    const initialBalance = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );

    // 2. Create a hold (1 hour expiration)
    const expirationDate = (Math.floor(Date.now() / 1000) + 3600).toString();
    const createRes: any = await createHold.execute(executorClient, context, {
      tokenId,
      amount: '10',
      escrow: context.accountId!,
      expirationDate,
    });
    const holdId = createRes.raw.holdId;
    expect(holdId).toBeDefined();

    await wait();

    // 3. Verify balance decreased
    const balanceAfterHold = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );
    expect(Number(balanceAfterHold)).toBe(Number(initialBalance) - 10);

    // 4. Release the hold
    const releaseRes: any = await releaseHold.execute(executorClient, context, {
      tokenId,
      holdId,
      amount: '10',
      sourceId: context.accountId!,
    });
    expect(releaseRes.humanMessage).toContain('Successfully released hold');

    await wait();

    // 5. Verify balance returned
    const finalBalance = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );
    expect(finalBalance).toBe(initialBalance);
  });
});
