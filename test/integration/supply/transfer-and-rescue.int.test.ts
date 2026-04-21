import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey, TransferTransaction, Hbar } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  getCustomClient,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import transferTool from '@/tools/supply/transfer-stablecoin';
import rescueHbarTool from '@/tools/supply/rescue-hbar-stablecoin';
import associateTool from '@/tools/account/associate-stablecoin';
import { CashInRequest, StableCoin } from '@hashgraph/stablecoin-npm-sdk';

describe('Transfer and Rescue HBAR Integration Tests', () => {
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
        accountMemo:
          'executor account for Transfer and Rescue Integration Tests',
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
      name: `Transfer Rescue Test ${Date.now()}`,
      symbol: 'TRF',
      config,
      context,
    });

    // 2. Associate the executor account
    const associate = associateTool(context, config);
    await associate.execute(executorClient, context, {
      tokenId,
      targetId: context.accountId!,
    });

    // 3. Create a test account (target)
    const newKey = PrivateKey.generateECDSA();
    userAccountId = await executorWrapper
      .createAccount({
        key: newKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
        accountMemo: 'transfer target account',
      })
      .then((resp) => resp.accountId!.toString());

    await executorWrapper.waitForAccount(userAccountId);

    // 4. Associate the test account
    await associate.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });

    // wait for associations
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);
    await executorWrapper.waitForAssociation(userAccountId, tokenId);

    // Grant KYC to both
    await executorWrapper.grantKyc({ accountId: context.accountId!, tokenId });
    await executorWrapper.grantKyc({ accountId: userAccountId, tokenId });

    // wait for KYC to be indexed
    await executorWrapper.waitForKyc(context.accountId!, tokenId);
    await executorWrapper.waitForKyc(userAccountId, tokenId);

    // Fund treasury with HBAR for rescue HBAR test
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();
    const opClient = getOperatorClientForTests();
    const transferTx = new TransferTransaction()
      .addHbarTransfer(opClient.operatorAccountId!, new Hbar(-5))
      .addHbarTransfer(treasuryId, new Hbar(5));
    await transferTx.execute(opClient);
    opClient.close();

    // 5. Mint tokens to executor
    await StableCoin.cashIn(
      new CashInRequest({
        tokenId,
        targetId: executorAccountId.toString(),
        amount: '100',
      })
    );

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

  it('should transfer tokens from executor to user', async () => {
    const transfer = transferTool(context, config);

    // Initial balances
    const initialUserBalance = await executorWrapper.getStablecoinBalance(
      userAccountId,
      tokenId
    );

    // Transfer 10 tokens
    const transferRes: any = await transfer.execute(executorClient, context, {
      tokenId,
      senderId: context.accountId!,
      receiverId: userAccountId,
      amount: '10',
    });
    expect(transferRes.humanMessage).toContain('transferred successfully');
    await wait();

    // Final balance
    const finalUserBalance = await executorWrapper.getStablecoinBalance(
      userAccountId,
      tokenId
    );
    expect(Number(finalUserBalance)).toBe(Number(initialUserBalance) + 10);
  });

  it('should execute rescue HBAR (base execution check)', async () => {
    const rescueHbar = rescueHbarTool(context, config);

    // Rescuing 1 HBAR (minimal check)
    const result: any = await rescueHbar.execute(executorClient, context, {
      tokenId,
      amount: '1',
    });
    expect(result.humanMessage).toContain('rescued successfully');
  });
});
