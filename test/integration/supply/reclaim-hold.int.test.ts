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
import reclaimHoldTool from '@/tools/supply/reclaim-hold';



describe('Reclaim Hold Integration Tests', () => {
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
        accountMemo: 'executor account for Reclaim Hold Integration Tests',
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
      name: `Reclaim Test ${Date.now()}`,
      symbol: 'RHT',
      config,
      context,
    });

    // 2. Associate the executor account
    await executorWrapper.associateToken({
      tokenId,
      accountId: context.accountId!,
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

    // 3. Mint some tokens to the executor
    await executorWrapper.cashIn({
      tokenId,
      targetId: executorAccountId.toString(),
      amount: '100',
    });

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

  it('should fail to reclaim a hold that has not expired', async () => {
    const reclaimHold = reclaimHoldTool(context, config);

    // 1. Create a hold with 1 hour expiration
    const expirationDate = (Math.floor(Date.now() / 1000) + 3600).toString();
    const createRes = await executorWrapper.createHold({
      tokenId,
      amount: '10',
      escrow: context.accountId!,
      expirationDate,
    });
    const holdId = createRes.holdId;

    // 2. Attempt to reclaim
    const reclaimRes: any = await reclaimHold.execute(executorClient, context, {
      tokenId,
      holdId,
      sourceId: context.accountId!,
    });

    expect(reclaimRes.humanMessage).toContain('Failed to reclaim hold');
    await wait();
  });

  it('should successfully reclaim an expired hold', async () => {
    const reclaimHold = reclaimHoldTool(context, config);

    // 1. Check initial balance - wait for previous test holds to settle
    await wait();
    const initialBalance = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );

    // 2. Create a hold that expires almost immediately (10 seconds)
    const expirationDate = (Math.floor(Date.now() / 1000) + 10).toString();
    const createRes = await executorWrapper.createHold({
      tokenId,
      amount: '20',
      escrow: context.accountId!,
      expirationDate,
    });
    const holdId = createRes.holdId;

    // 3. Wait for balance to sync and verify it decreased by 20 (held)
    console.log(`Hold created with ID: ${holdId}`);
    await wait(5000);

    let balanceAfterHold = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId,
    );
    console.log(`Balance after hold: ${balanceAfterHold} (initial: ${initialBalance})`);
    expect(Number(balanceAfterHold)).toBe(Number(initialBalance) - 20);

    // 4. Wait for it to expire
    await wait(15000); // Wait 25 seconds from creation)

    // 5. Reclaim the hold
    const reclaimRes: any = await reclaimHold.execute(executorClient, context, {
      tokenId,
      holdId,
      sourceId: context.accountId!,
    });

    expect(reclaimRes.humanMessage).toContain('Successfully reclaimed hold');
    await wait();

    // 6. Verify balance returned to initial
    const finalBalance = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );
    expect(finalBalance.toString()).toBe(initialBalance.toString());
  }, 120000);
});
