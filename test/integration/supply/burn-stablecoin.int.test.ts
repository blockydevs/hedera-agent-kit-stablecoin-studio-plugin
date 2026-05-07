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
import burnTool from '@/tools/supply/burn-stablecoin';

describe('Burn Stablecoin Integration Tests', () => {
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
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Burn Integration Tests',
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
      name: `Burn Test ${Date.now()}`,
      symbol: 'BRN',
      config,
      context,
    });

    // Associate the executor account using wrapper
    await executorWrapper.associateToken({
      accountId: context.accountId!,
      tokenId,
      privateKey: executorKey,
    }).catch(() => {});

    // wait for association to be indexed
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);

    // Grant KYC to executor
    await executorWrapper.grantKyc({
      targetId: context.accountId!,
      tokenId,
    });
    await executorWrapper.waitForKyc(context.accountId!, tokenId);
    
    // Cash in tokens to burn them later
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();
    await executorWrapper.cashIn({
      tokenId,
      amount: '100',
      targetId: treasuryId,
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

  it('should burn tokens from treasury', async () => {
    const burn = burnTool(context, config);

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();

    const amount = '100';

    // Burn
    const result: any = await burn.execute(executorClient, context, { tokenId, amount });
    expect(result.humanMessage).toContain('Successfully burned');

    await wait()

    const balance = await executorWrapper.getStablecoinBalance(
      treasuryId,
      tokenId
    );
    expect(balance.toString()).toBe('0');
  });

  it('should accept optional startDate for burn', async () => {
    const burn = burnTool(context, config);
    
    // Mint some tokens first to treasury
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();
    await executorWrapper.cashIn({
      tokenId,
      amount: '10',
      targetId: treasuryId,
    });
    await wait();

    const amount = '10';
    // Provide a startDate (current time)
    // Note: Scheduling usually requires more setup, but we're testing if the tool handles the param.
    const startDate = new Date().toISOString();

    const result: any = await burn.execute(executorClient, context, { 
      tokenId, 
      amount,
      startDate 
    });
    expect(result.humanMessage).toContain('Successfully burned');
  });
});
