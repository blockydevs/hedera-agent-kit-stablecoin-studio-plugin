import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey, AccountId } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  getCustomClient,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import isFrozenTool from '@/tools/account/is-account-frozen';

describe('Is Account Frozen Integration Tests', () => {
  let operatorClient: Client;
  let executorClient: Client;
  let operatorWrapper: HederaOperationsWrapper;
  let executorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let userAccountId: string;
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
        accountMemo: 'executor account for Is Frozen Integration Tests',
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
      name: `Freeze Test ${Date.now()}`,
      symbol: 'FRZ',
      config,
      context,
    });

    const newKey = PrivateKey.generateECDSA();
    userAccountId = await executorWrapper
      .createAccount({
        key: newKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
        accountMemo: 'freeze target account',
      })
      .then((resp) => resp.accountId!.toString());

    await executorWrapper.waitForAccount(userAccountId);

    const userWrapper = new HederaOperationsWrapper(
      getCustomClient(AccountId.fromString(userAccountId), newKey),
      newKey
    );
    await userWrapper.associateToken({ accountId: userAccountId, tokenId, privateKey: newKey });
    await userWrapper.waitForAssociation(userAccountId, tokenId);

    // Freeze account using wrapper
    await executorWrapper.freezeAccount({
        tokenId,
        accountId: userAccountId,
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

  it('should check if account is frozen', async () => {
    const isFrozen = isFrozenTool(context, config);

    const result: any = await isFrozen.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    
    expect(result.raw.isFrozen).toBe(true);
  });
});
