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
import updateStablecoinTool from '@/tools/lifecycle/update-stablecoin';

describe('Update Stablecoin Integration Tests', () => {
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
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MAXIMUM),
        accountMemo: 'executor account for Update Stablecoin Integration Tests',
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
      name: `Update Test ${Date.now()}`,
      symbol: 'UPT',
      config,
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

  it('should update stablecoin name and symbol', async () => {
    const tool = updateStablecoinTool(context, config);

    const newName = `Updated Token ${Date.now()}`;
    const newSymbol = 'NEW';
    const newMetadata = 'Updated metadata';

    await tool.execute(executorClient, context, {
      tokenId,
      name: newName,
      symbol: newSymbol,
      metadata: newMetadata,
    });
    await wait(5000);

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    expect(info.name).toBe(newName);
    expect(info.symbol).toBe(newSymbol);
    expect(info.metadata).toBe(newMetadata);
  });

  it('should update role keys', async () => {
    const tool = updateStablecoinTool(context, config);

    const newKey = executorClient.operatorPublicKey!.toStringRaw();

    const result = await tool.execute(executorClient, context, {
      tokenId,
      kycKey: newKey,
      wipeKey: newKey,
      freezeKey: newKey,
      pauseKey: newKey,
      feeScheduleKey: newKey,
    });
    expect(result.humanMessage.toLowerCase()).toContain('successfully');

    await wait(5000);

    const info = await executorWrapper.getStablecoinInfo(tokenId);

    const normalize = (key: any) => {
      if (!key) return '';
      const s = key.key || key.toString();
      return s.startsWith('0x') ? s.substring(2) : s;
    };

    const expectedKey = normalize(newKey);
    expect(normalize(info.kycKey)).toBe(expectedKey);
    expect(normalize(info.wipeKey)).toBe(expectedKey);
    expect(normalize(info.freezeKey)).toBe(expectedKey);
    expect(normalize(info.pauseKey)).toBe(expectedKey);
  });

  it('should clear role keys when passing empty string', async () => {
    const tokenId = await executorWrapper.createStablecoin({
      name: 'ClearKeysToken',
      symbol: 'CKT',
      keys: {
        kycKey: executorClient.operatorPublicKey!.toString(),
        wipeKey: executorClient.operatorPublicKey!.toString(),
      },
      context: { accountId: executorClient.operatorAccountId!.toString() } as any,
    });

    const tool = updateStablecoinTool(context, config);
    const result = await tool.execute(executorClient, context, {
      tokenId,
      kycKey: "",
      wipeKey: "",
    });

    expect(result.humanMessage.toLowerCase()).toContain('successfully');

    await wait();

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const proxyAddress = info.proxyAddress?.toString() || '';
    
    // When a key is returned to contract management, the SDK returns the proxy contract ID
    expect(info.kycKey?.toString()).toBe(proxyAddress);
    expect(info.wipeKey?.toString()).toBe(proxyAddress);
  });
});
