import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  getCustomClient,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
} from '../test-utils';
import isAssociatedTool from '@/tools/account/is-account-associated';

describe('Is Account Associated Integration Tests', () => {
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
      PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY! || '')
    );

    // Create executor account
    const executorKey = PrivateKey.generateECDSA();
    const executorAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Is Associated Integration Tests',
      })
      .then((resp) => resp.accountId!);

    await operatorWrapper.waitForAccount(executorAccountId.toString());

    executorClient = getCustomClient(executorAccountId, executorKey);
    executorWrapper = new HederaOperationsWrapper(
      executorClient,
      PrivateKey.fromStringECDSA(executorKey.toStringDer())
    );

    context = {
      mode: AgentMode.AUTONOMOUS,
      accountId: executorAccountId.toString(),
    };

    config = {
      accountId: executorAccountId.toString(),
      privateKey: executorKey.toStringDer(),
    };

    tokenId = await operatorWrapper.createStablecoin({
      name: `Is Associated Test ${Date.now()}`,
      symbol: 'IAT',
      config: {
          accountId: operatorClient.operatorAccountId!.toString(),
          privateKey: process.env.PRIVATE_KEY!
      },
      context,
    });

    // Associate using wrapper
    await executorWrapper.associateToken({
        accountId: executorAccountId.toString(),
        tokenId,
        privateKey: executorKey
    });

    await executorWrapper.waitForAssociation(executorAccountId.toString(), tokenId);
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

  it('should check if account is associated using explicit targetId', async () => {
    const isAssociated = isAssociatedTool(context, config);

    const result: any = await isAssociated.execute(executorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });
    
    expect(result.raw.isAssociated).toBe(true);
  });

  it('should check if account is associated using default targetId', async () => {
    const isAssociated = isAssociatedTool(context, config);

    const result: any = await isAssociated.execute(executorClient, context, {
      tokenId,
    });
    
    expect(result.raw.isAssociated).toBe(true);
  });
});
