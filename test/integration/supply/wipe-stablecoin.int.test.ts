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
import wipeStablecoinTool from '@/tools/supply/wipe-stablecoin';

import { CashInRequest, StableCoin } from '@hashgraph/stablecoin-npm-sdk';

describe('Wipe Stablecoin Integration Tests', () => {
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
        accountMemo: 'executor account for Wipe Stablecoin Integration Tests',
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
      name: `Wipe Test ${Date.now()}`,
      symbol: 'WPT',
      config,
      context,
    });

    // 2. Associate the executor account
    await executorWrapper.associateToken({
      tokenId,
      accountId: context.accountId!,
    });
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);

    // 3. Grant KYC to executor
    await executorWrapper.grantKyc({
      accountId: context.accountId!,
      tokenId,
    });
    await executorWrapper.waitForKyc(context.accountId!, tokenId);
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

  it('should wipe tokens from another account', async () => {
    const wipe = wipeStablecoinTool(context, config);

    // 1. Create a dummy account (target)
    const newKey = PrivateKey.generateECDSA();
    const userAccountId = await executorWrapper
      .createAccount({
        key: newKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
        accountMemo: 'wipe target account',
      })
      .then((resp) => resp.accountId!.toString());

    await executorWrapper.waitForAccount(userAccountId);

    // 2. Associate user with token
    await executorWrapper.associateToken({
      tokenId,
      accountId: userAccountId,
      privateKey: newKey,
    });

    // wait for association to be indexed
    await executorWrapper.waitForAssociation(userAccountId, tokenId);

    // Grant KYC to user
    await executorWrapper.grantKyc({
      accountId: userAccountId,
      tokenId,
    });
    await executorWrapper.waitForKyc(userAccountId, tokenId);
    await wait();

    // 3. Mint to user
    await StableCoin.cashIn(
      new CashInRequest({
        tokenId,
        targetId: userAccountId,
        amount: '50',
      })
    );
    await wait();

    let balance = await executorWrapper.getStablecoinBalance(
      userAccountId,
      tokenId
    );
    expect(balance.toString()).toBe('50');

    // 4. Wipe from user
    await wipe.execute(executorClient, context, {
      tokenId,
      amount: '50',
      targetId: userAccountId,
    });

    await wait();

    balance = await executorWrapper.getStablecoinBalance(userAccountId, tokenId);
    expect(balance.toString()).toBe('0');
  });

  it('should wipe tokens from the executor account (default targetId)', async () => {
    const wipe = wipeStablecoinTool(context, config);

    // 1. Mint tokens to executor first
    await executorWrapper.cashIn({
      tokenId,
      targetId: context.accountId!,
      amount: '10',
    });
    await wait();

    let balance = await executorWrapper.getStablecoinBalance(context.accountId!, tokenId);
    const initialBalance = Number(balance);

    // 2. Wipe from executor using default targetId
    await wipe.execute(executorClient, context, {
      tokenId,
      amount: '10',
    });

    await wait();

    balance = await executorWrapper.getStablecoinBalance(context.accountId!, tokenId);
    expect(Number(balance)).toBe(initialBalance - 10);
  });
});
