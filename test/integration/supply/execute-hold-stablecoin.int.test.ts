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
import executeHoldTool from '@/tools/supply/execute-hold';

describe('Execute Hold Integration Tests', () => {
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
        accountMemo: 'executor account for Execute Hold Integration Tests',
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
      name: `Execute Hold Test ${Date.now()}`,
      symbol: 'EHT',
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

    // Grant KYC to executor
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

  it('should execute a hold with default targetId', async () => {
    const executeHold = executeHoldTool(context, config);

    // 1. Create a hold with 1 hour expiration
    const expirationDate = (Math.floor(Date.now() / 1000) + 3600).toString();
    const createRes = await executorWrapper.createHold({
      tokenId,
      amount: '10',
      escrow: context.accountId!,
      expirationDate,
    });
    const holdId = createRes.holdId;
    expect(holdId).toBeDefined();

    await wait();

    // 2. Check balance before execution
    const balanceBeforeExec = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );

    // 3. Execute the hold
    // Be explicit with targetId
    const executeRes: any = await executeHold.execute(executorClient, context, {
      tokenId,
      holdId: holdId!,
      amount: '10',
      sourceId: context.accountId!,
      targetId: context.accountId!,
    });

    expect(executeRes.humanMessage).toContain('Successfully executed hold');
    await wait();

    // 4. Verify balance returned (since it was executed to the same account)
    const finalBalance = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );
    expect(Number(finalBalance)).toBe(Number(balanceBeforeExec) + 10);
  });

  it('should execute a hold to a specific targetId', async () => {
    const executeHold = executeHoldTool(context, config);

    // 1. Create another account (recipient)
    const recipientKey = PrivateKey.generateECDSA();
    const recipientAccountId = await operatorWrapper
      .createAccount({
        key: recipientKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
        accountMemo: 'recipient account for Execute Hold',
      })
      .then((resp) => resp.accountId!.toString());

    await operatorWrapper.waitForAccount(recipientAccountId);

    // 2. Associate recipient with token
    await executorWrapper.associateToken({
      tokenId,
      accountId: recipientAccountId,
      privateKey: recipientKey,
    });
    await executorWrapper.waitForAssociation(recipientAccountId, tokenId);

    // Grant KYC to recipient
    await executorWrapper.grantKyc({
      accountId: recipientAccountId,
      tokenId,
    });
    await executorWrapper.waitForKyc(recipientAccountId, tokenId);

    // 3. Create a hold restricted to recipient
    const expirationDate = (Math.floor(Date.now() / 1000) + 3600).toString();
    const createRes = await executorWrapper.createHold({
      tokenId,
      amount: '20',
      escrow: context.accountId!,
      expirationDate,
      targetId: recipientAccountId,
    });
    const holdId = createRes.holdId;

    await wait();

    // 4. Execute the hold to recipient
    const executeRes: any = await executeHold.execute(executorClient, context, {
      tokenId,
      holdId: holdId!,
      amount: '20',
      sourceId: context.accountId!,
      targetId: recipientAccountId,
    });

    expect(executeRes.humanMessage).toContain('Successfully executed hold');
    await wait();

    // 5. Verify recipient balance
    const recipientBalance = await executorWrapper.getStablecoinBalance(
      recipientAccountId,
      tokenId
    );
    expect(recipientBalance.toString()).toBe('20');
  });
});
