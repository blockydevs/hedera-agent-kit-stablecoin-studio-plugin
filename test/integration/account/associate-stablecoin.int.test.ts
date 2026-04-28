
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import associateStablecoinTool from '@/tools/account/associate-stablecoin';

describe('Associate Stablecoin Tool Integration Tests', () => {
  let operatorClient: Client;
  let operatorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;
  let targetId: string;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    operatorClient = getOperatorClientForTests();
    operatorWrapper = new HederaOperationsWrapper(
      operatorClient,
      PrivateKey.fromStringDer(process.env.PRIVATE_KEY || ''),
    );

    // Create executor account
    const executorKey = PrivateKey.generateECDSA();
    const targetAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.STANDARD),
        accountMemo: 'executor account for Association Integration Tests',
      })
      .then(resp => resp.accountId!);

    await operatorWrapper.waitForAccount(targetAccountId.toString());

    context = {
      mode: AgentMode.AUTONOMOUS,
      accountId: operatorClient.operatorAccountId!.toString(),
    };

    config = {
      accountId: operatorClient.operatorAccountId!.toString(),
      privateKey: process.env.PRIVATE_KEY!,
    };

    // Create a stablecoin
    tokenId = await operatorWrapper.createStablecoin({
      name: `Assoc Test ${Date.now()}`,
      symbol: 'AST',
      config: {
        decimals: 2,
      },
      context,
    });

    targetId = config.accountId;
  });

  afterAll(async () => {
    if (operatorClient) {
      operatorClient.close();
    }
  });

  it('should associate account with token and handle double association gracefully', async () => {
    const tool = associateStablecoinTool(context, config);

    // 1. First association (should succeed)
    console.log(`Associating ${targetId} with ${tokenId} for the first time...`);
    const result1: any = await tool.execute(operatorClient, context, {
      tokenId,
      targetId,
    });

    expect(result1.raw.status.toString()).toBe('SUCCESS');
    expect(result1.humanMessage).toContain('Successfully associated');

    // Wait for mirror node
    await wait(10000);

    // 2. Second association (should also return success message instead of failing)
    console.log(`Associating ${targetId} with ${tokenId} for the second time...`);
    const result2: any = await tool.execute(operatorClient, context, {
      tokenId,
      targetId,
    });

    // Check that it's handled gracefully
    expect(result2.raw.status.toString()).toBe('SUCCESS');
    expect(result2.humanMessage).toContain('already associated');
  });
});
