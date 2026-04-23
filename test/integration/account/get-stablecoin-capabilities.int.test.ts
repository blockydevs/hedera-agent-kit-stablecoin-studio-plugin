import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey, Hbar } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  getCustomClient,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
} from '../test-utils';
import getStablecoinCapabilitiesTool from '@/tools/account/get-stablecoin-capabilities';

describe('Capabilities Integration Tests', () => {
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
    operatorClient.setDefaultMaxTransactionFee(new Hbar(20));
    operatorWrapper = new HederaOperationsWrapper(operatorClient, PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY || ''));

    // Create executor account
    const executorKey = PrivateKey.generateECDSA();
    const executorAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MAXIMUM),
        accountMemo: 'executor account for Capabilities Integration Tests',
      })
      .then((resp) => resp.accountId!);

    // Ensure account is indexed by mirror node before using it with Stablecoin SDK
    await operatorWrapper.waitForAccount(executorAccountId.toString());

    executorClient = getCustomClient(executorAccountId, executorKey);
    executorClient.setDefaultMaxTransactionFee(new Hbar(20));
    executorWrapper = new HederaOperationsWrapper(executorClient, PrivateKey.fromStringECDSA(executorKey.toString()));

    context = {
      mode: AgentMode.AUTONOMOUS,
      accountId: executorAccountId.toString(),
    };

    config = {
      accountId: executorAccountId.toString(),
      privateKey: executorKey.toStringDer(),
    };


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

  it('should return the capabilities for the creator account using explicit targetId', async () => {

    console.log(
      `Executor account ${config.accountId} created and configured for Capabilities Integration Tests`,
    );

    // 1. Create a stablecoin
    tokenId = await executorWrapper.createStablecoin({
      name: `Capabilities Test ${Date.now()}`,
      symbol: 'CAP',
      config,
      context,
    });

    const tool = getStablecoinCapabilitiesTool(context, config);

    const result: any = await tool.execute(operatorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });

    expect(result.raw.capabilities).toBeDefined();
    expect(result.raw.capabilities.canBurn).toBe(true);
    expect(result.raw.capabilities.canMint).toBe(true);
    expect(result.humanMessage).toContain('Capabilities for account');
  });

  it('should return the capabilities for the creator account using default targetId', async () => {
    const tool = getStablecoinCapabilitiesTool(context, config);

    const result: any = await tool.execute(operatorClient, context, {
      tokenId,
    });

    expect(result.raw.capabilities).toBeDefined();
    expect(result.raw.capabilities.canBurn).toBe(true);
    expect(result.raw.capabilities.canMint).toBe(true);
    expect(result.humanMessage).toContain('Capabilities for account');
  });
});
