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
import revokeRoleTool from '@/tools/lifecycle/revoke-role-stablecoin';
import { StableCoinRole } from '@hashgraph/stablecoin-npm-sdk';

describe('Revoke Role Stablecoin Integration Tests', () => {
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

    // Create executor account
    const executorKey = PrivateKey.generateECDSA();
    const executorAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Revoke Role Integration Tests',
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
      name: `Revoke Role Test ${Date.now()}`,
      symbol: 'RVT',
      config,
      context,
    });

    // 2. Create a test account
    const newKey = PrivateKey.generateECDSA();
    userAccountId = await executorWrapper
      .createAccount({
        key: newKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
        accountMemo: 'role target account',
      })
      .then((resp) => resp.accountId!.toString());

    await executorWrapper.waitForAccount(userAccountId);
    
    // Grant role before testing revoke
    await executorWrapper.grantRole({
      tokenId,
      targetId: userAccountId,
      role: 'CASHIN_ROLE',
    });
    await wait();
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

  it('should revoke a role from the account', async () => {
    const revoke = revokeRoleTool(context, config);

    // Revoke CASHIN_ROLE
    const revokeRes: any = await revoke.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
      role: 'CASHIN_ROLE',
    });
    expect(revokeRes.humanMessage).toContain(
      'Successfully revoked role from account for stablecoin.',
    );

    await wait(15000);

    // Verify role revoked with retries
    let hasCashInRole = true;
    for (let i = 0; i < 5; i++) {
        hasCashInRole = await executorWrapper.hasRole(userAccountId, tokenId, StableCoinRole.CASHIN_ROLE);
        if (!hasCashInRole) break;
        await wait(5000);
    }
    
    expect(hasCashInRole).toBe(false);
  });
});
