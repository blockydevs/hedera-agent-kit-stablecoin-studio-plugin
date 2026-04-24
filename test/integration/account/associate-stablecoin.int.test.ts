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

describe('Associate Stablecoin Integration Tests', () => {
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
        accountMemo: 'executor account for Associate Integration Tests',
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
      name: `Associate Test ${Date.now()}`,
      symbol: 'AST',
      config: {
          accountId: operatorClient.operatorAccountId!.toString(),
          privateKey: process.env.PRIVATE_KEY!
      },
      context,
    });
  });

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

  it('should associate the agent account using default targetId', async () => {
    const associate = associateTool(context, config);

    // Associate (using the tool without targetId)
    await associate.execute(executorClient, context, {
      tokenId,
    });

    // Wait for indexing
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);

    // Verify
    const isAssociated = await executorWrapper.isTokenAssociated(context.accountId!, tokenId);
    expect(isAssociated).toBe(true);
  });

  it('should associate the agent account using explicit targetId', async () => {
    // Note: We need a new token because the account is already associated from the previous test
    const newTokenId = await operatorWrapper.createStablecoin({
      name: `Associate Test Explicit ${Date.now()}`,
      symbol: 'ASTE',
      config: {
          accountId: operatorClient.operatorAccountId!.toString(),
          privateKey: process.env.PRIVATE_KEY!
      },
      context,
    });

    const associate = associateTool(context, config);

    // Associate (using the tool with explicit targetId)
    await associate.execute(executorClient, context, {
      tokenId: newTokenId,
      targetId: context.accountId!,
    });

    // Wait for indexing
    await executorWrapper.waitForAssociation(context.accountId!, newTokenId);

    // Verify
    const isAssociated = await executorWrapper.isTokenAssociated(context.accountId!, newTokenId);
    expect(isAssociated).toBe(true);
  });
});
