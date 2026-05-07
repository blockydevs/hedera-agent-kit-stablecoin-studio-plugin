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

describe('Create Hold Relative Duration Integration Tests', () => {
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

    const executorKey = PrivateKey.generateECDSA();
    const executorAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Hold Relative Duration Tests',
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

    tokenId = await executorWrapper.createStablecoin({
      name: `Hold Rel Test ${Date.now()}`,
      symbol: 'HRT',
      config,
      context,
    });

    await executorWrapper.associateToken({
      tokenId,
      accountId: context.accountId!,
    });

    await executorWrapper.waitForAssociation(context.accountId!, tokenId);

    await executorWrapper.grantKyc({
      targetId: context.accountId!,
      tokenId,
    });
    
    await executorWrapper.waitForKyc(context.accountId!, tokenId);

    await executorWrapper.cashIn({
      tokenId,
      targetId: executorAccountId.toString(),
      amount: '100',
    });

    await wait();
  }, 60000);

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

  it('should create a hold using relative duration "1h"', async () => {
    const createHold = createHoldTool(context, config);

    const result: any = await createHold.execute(executorClient, context, {
      tokenId,
      amount: '10',
      escrow: context.accountId!,
      expirationDate: '1h',
    });

    expect(result.humanMessage).toContain('Hold created successfully');
  }, 30000);

  it('should create a hold using absolute timestamp (legacy support)', async () => {
    const createHold = createHoldTool(context, config);
    const expirationDate = (Math.floor(Date.now() / 1000) + 7200).toString();

    const result: any = await createHold.execute(executorClient, context, {
      tokenId,
      amount: '5',
      escrow: context.accountId!,
      expirationDate,
    });

    expect(result.humanMessage).toContain('Hold created successfully');
  }, 30000);
});
