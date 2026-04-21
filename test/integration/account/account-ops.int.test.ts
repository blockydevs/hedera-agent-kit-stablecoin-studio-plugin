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
import associateTool from '@/tools/account/associate-stablecoin';
import isAssociatedTool from '@/tools/account/is-account-associated';
import getBalanceTool from '@/tools/account/get-stablecoin-balance';

describe('Account Operations Integration Tests', () => {
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
        accountMemo: 'executor account for Account Operations Integration Tests',
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

    tokenId = await executorWrapper.createStablecoin({
      name: `Account Ops Test ${Date.now()}`,
      symbol: 'AOT',
      config,
      context,
    });
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

  it('should associate the agent account and check its status and balance', async () => {
    const associate = associateTool(context, config);
    const isAssociated = isAssociatedTool(context, config);
    const getBalance = getBalanceTool(context, config);

    // 1. Check initial status 
    let statusRes: any = await isAssociated.execute(executorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });
    
    // 2. Associate (using the tool)
    // NOTE: The creator might already be associated, but we test the tool flow.
    await associate.execute(executorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });

    // 3. Wait for indexing
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);

    // 4. Check status again (should be true)
    statusRes = await isAssociated.execute(executorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });
    expect(statusRes.raw.isAssociated).toBe(true);

    // 5. Get balance
    const balanceRes: any = await getBalance.execute(executorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });
    expect(balanceRes.raw.balance).toBeDefined();
    expect(balanceRes.humanMessage).toContain('Balance of token');
  });
});
