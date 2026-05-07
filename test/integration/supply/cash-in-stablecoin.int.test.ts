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

describe('Cash-in Stablecoin Integration Tests', () => {
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
        accountMemo: 'executor account for Cash-in Integration Tests',
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
      name: `CashIn Test ${Date.now()}`,
      symbol: 'CIN',
      config,
      context,
    });

    // Associate the executor account using wrapper
    await executorWrapper.associateToken({
      accountId: context.accountId!,
      tokenId,
      privateKey: executorKey,
    }).catch(() => {}); // might already be associated if creator

    // wait for association to be indexed
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);

    // Grant KYC to executor
    await executorWrapper.grantKyc({
      targetId: context.accountId!,
      tokenId,
    });
    await executorWrapper.waitForKyc(context.accountId!, tokenId);
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

  it('should cash-in tokens to treasury', async () => {
    const cashIn = cashInTool(context, config);

    // Identify the treasury account
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();

    const amount = '100';

    // Cash-in (mint) to treasury
    const result: any = await cashIn.execute(executorClient, context, {
      tokenId,
      amount,
      targetId: treasuryId,
    });

    expect(result.humanMessage).toContain('Successfully minted tokens');
    await wait();

    const balance = await executorWrapper.getStablecoinBalance(
      treasuryId,
      tokenId
    );
    expect(balance.toString()).toBe('100');
  });

  it('should cash-in tokens to the default targetId (executor)', async () => {
    const cashIn = cashInTool(context, config);
    const amount = '50';

    const initialBalance = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );

    // Cash-in (mint) to default targetId (executor)
    const result: any = await cashIn.execute(executorClient, context, {
      tokenId,
      amount,
    });

    expect(result.humanMessage).toContain('Successfully minted tokens');
    await wait();

    const finalBalance = await executorWrapper.getStablecoinBalance(
      context.accountId!,
      tokenId
    );
    expect(Number(finalBalance)).toBe(Number(initialBalance) + 50);
  });
});
