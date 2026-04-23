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
import createStablecoinTool from '@/tools/lifecycle/create-stablecoin';
import { StableCoinViewModel } from '@hashgraph/stablecoin-npm-sdk';

describe('Create Stablecoin Integration Tests', () => {
  let operatorClient: Client;
  let executorClient: Client;
  let operatorWrapper: HederaOperationsWrapper;
  let executorWrapper: HederaOperationsWrapper;
  let context: Context;
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
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MAXIMUM),
        accountMemo: 'executor account for Create Stablecoin Integration Tests',
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

  it('should create a stablecoin with minimal parameters', async () => {
    const tool = createStablecoinTool(context, config);

    const name = `IT Token ${Date.now()}`;
    const params = {
      name,
      symbol: 'ITT',
      decimals: 6,
    };

    const result: any = await tool.execute(executorClient, context, params);

    expect(result.humanMessage).toContain('Stablecoin created successfully');
    await wait();

    // Extract tokenId from result or search for it
    const tokenId =
      result.raw?.coin?.tokenId && result.raw.coin.tokenId.toString() !== '0.0.0'
        ? result.raw.coin.tokenId.toString()
        : await executorWrapper.getLatestTokenId(context.accountId!, name);

    const info: StableCoinViewModel = await executorWrapper.getStablecoinInfo(
      tokenId
    );

    expect(info.name).toBe(params.name);
    expect(info.symbol).toBe(params.symbol);
    expect(info.decimals).toBe(params.decimals);
    expect(info.treasury).toBeDefined();
    expect(info.treasury!.toString()).not.toBe('0.0.0');
  });

  it('should create a stablecoin with finite supply and max supply', async () => {
    const tool = createStablecoinTool(context, config);

    const name = `Finite Token ${Date.now()}`;
    const params = {
      name,
      symbol: 'FTT',
      decimals: 8,
      initialSupply: '500',
      maxSupply: '1000',
      supplyType: 'FINITE' as const,
    };

    const result: any = await tool.execute(executorClient, context, params);

    expect(result.humanMessage).toContain('Stablecoin created successfully');
    await wait();

    const tokenId =
      result.raw?.tokenId?.toString() ||
      (await executorWrapper.getLatestTokenId(context.accountId!, name));

    const info: StableCoinViewModel = await executorWrapper.getStablecoinInfo(
      tokenId
    );

    expect(info.name).toBe(params.name);
    expect(info.decimals).toBe(params.decimals);
    expect(info.totalSupply?.toString()).toBe('500');
    expect(info.maxSupply?.toString()).toBe('1000');
  });

  it('should create a stablecoin with custom role accounts', async () => {
    const tool = createStablecoinTool(context, config);

    // Create a second account for roles
    const otherKey = PrivateKey.generateECDSA();
    const otherAccount = await operatorWrapper.createAccount({
      key: otherKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
    });
    const otherId = otherAccount.accountId!.toString();
    await operatorWrapper.waitForAccount(otherId);

    const name = `Roles Token ${Date.now()}`;
    const params = {
      name,
      symbol: 'RTT',
      burnRoleAccount: otherId,
      wipeRoleAccount: otherId,
      rescueRoleAccount: otherId,
      pauseRoleAccount: otherId,
      freezeRoleAccount: otherId,
      deleteRoleAccount: otherId,
      kycRoleAccount: otherId,
      cashInRoleAccount: otherId,
      feeRoleAccount: otherId,
    };

    const result: any = await tool.execute(executorClient, context, params);

    expect(result.humanMessage).toContain('Stablecoin created successfully');
    await wait();

    const tokenId =
      result.raw?.tokenId?.toString() ||
      (await executorWrapper.getLatestTokenId(context.accountId!, name));

    // Verify capabilities of the other account
    const capabilities = await executorWrapper.getCapabilities(otherId, tokenId);
    
    const operations = capabilities.capabilities.map(c => c.operation);
    expect(operations).toContain('Burn');
    expect(operations).toContain('Wipe');
    expect(operations).toContain('Rescue');
    expect(operations).toContain('Pause');
    expect(operations).toContain('Freeze');
    expect(operations).toContain('Delete');
    expect(operations).toContain('Cash_in');
  });
});
