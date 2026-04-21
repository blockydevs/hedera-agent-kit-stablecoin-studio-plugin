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
import cashInTool from '@/tools/supply/cash-in-stablecoin';
import burnTool from '@/tools/supply/burn-stablecoin';
import associateTool from '@/tools/account/associate-stablecoin';

describe('Cash-in and Burn Integration Tests', () => {
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
        accountMemo: 'executor account for Cash-in and Burn Integration Tests',
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
      name: `Supply Test ${Date.now()}`,
      symbol: 'SPT',
      config,
      context,
    });

    // Associate the executor account
    const associate = associateTool(context, config);
    await associate.execute(executorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });

    // wait for association to be indexed
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);

    // Grant KYC to executor
    await executorWrapper.grantKyc({
      accountId: context.accountId!,
      tokenId,
    });
    await executorWrapper.waitForKyc(context.accountId!, tokenId);
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

  it('should cash-in and then burn tokens', async () => {
    const cashIn = cashInTool(context, config);
    const burn = burnTool(context, config);

    // Identify the treasury account
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();

    const amount = '100';

    // Cash-in (mint) to treasury
    await cashIn.execute(executorClient, context, {
      tokenId,
      amount,
      targetId: treasuryId,
    });

    await wait();

    let balance = await executorWrapper.getStablecoinBalance(
      treasuryId,
      tokenId
    );
    expect(balance.toString()).toBe('100');

    // Burn
    await burn.execute(executorClient, context, { tokenId, amount });

    await wait()

    balance = await executorWrapper.getStablecoinBalance(
      treasuryId,
      tokenId
    );
    expect(balance.toString()).toBe('0');
  });
});
