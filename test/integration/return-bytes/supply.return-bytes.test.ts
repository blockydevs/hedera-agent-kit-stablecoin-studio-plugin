import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AccountId, Client, PrivateKey, Transaction } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import { StableCoinRole } from '@hashgraph/stablecoin-npm-sdk';
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
import wipeTool from '@/tools/supply/wipe-stablecoin';

describe('Supply Return Bytes Mode Integration Tests', () => {
  let fundingClient: Client;
  let fundingKey: PrivateKey;
  let operatorNonKeyClient: Client;
  let executorKey: PrivateKey;
  let executorAccountId: string;
  let fundingWrapper: HederaOperationsWrapper;
  let executorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    fundingKey = PrivateKey.fromString(process.env.PRIVATE_KEY! || '');
    operatorNonKeyClient = Client.forTestnet();
    fundingClient = getOperatorClientForTests();
    fundingWrapper = new HederaOperationsWrapper(fundingClient, fundingKey);

    // Create executor account (admin for this test file)
    executorKey = PrivateKey.generateECDSA();
    executorAccountId = await fundingWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Supply RB Tests',
      })
      .then(resp => resp.accountId!.toString());

    await fundingWrapper.waitForAccount(executorAccountId);

    executorWrapper = new HederaOperationsWrapper(
      getCustomClient(AccountId.fromString(executorAccountId), executorKey),
      executorKey,
    );

    context = {
      mode: AgentMode.RETURN_BYTES,
      accountId: executorAccountId,
      accountPublicKey: executorKey.publicKey.toStringDer(),
    };

    config = {
      accountId: executorAccountId,
    };

    // Create stablecoin with executor account as all roles
    tokenId = await executorWrapper.createStablecoin({
      name: `RB Supply Test ${Date.now()}`,
      symbol: 'RBS',
      config: {
        accountId: executorAccountId,
        privateKey: executorKey.toStringDer(),
      },
      context,
    });

    await executorWrapper.associateToken({
      accountId: executorAccountId,
      tokenId,
      privateKey: executorKey,
    });
    await executorWrapper.waitForAssociation(executorAccountId, tokenId);

    await executorWrapper.grantKyc({
      targetId: executorAccountId,
      tokenId,
    });
    await executorWrapper.waitForKyc(executorAccountId, tokenId);

    // Grant roles to executorAccountId so it can perform actions in tests
    await executorWrapper.grantRole({ tokenId, targetId: executorAccountId, role: StableCoinRole.CASHIN_ROLE });
    await executorWrapper.grantRole({ tokenId, targetId: executorAccountId, role: StableCoinRole.BURN_ROLE });
    await executorWrapper.grantRole({ tokenId, targetId: executorAccountId, role: StableCoinRole.WIPE_ROLE });

    await wait(10000); // Wait for roles to propagate
  });

  afterAll(async () => {
    if (fundingClient && executorAccountId) {
      try {
        await executorWrapper.deleteAccount({
          accountId: AccountId.fromString(executorAccountId),
          transferAccountId: fundingClient.operatorAccountId!,
        });
      } catch (error) {
        console.warn('Failed to clean up executor account:', error);
      }
      fundingClient.close();
    }
  });

  it('should return transaction bytes for cash-in and allow external signing', async () => {
    const cashIn = cashInTool(context, config);

    const result: any = await cashIn.execute(operatorNonKeyClient, context, {
      tokenId,
      amount: '100',
      // targetId should default to context.accountId (executorAccountId)
    });

    console.log(JSON.stringify(result, null, 2));

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);

    // Sign with executor key
    try {
      await transaction.sign(executorKey);
      const response = await transaction.execute(fundingClient);
      await response.getReceipt(fundingClient);
    } catch (error) {
      throw error;
    }

    await wait(5000);

    // Verify
    const balance = await executorWrapper.getStablecoinBalance(executorAccountId, tokenId);
    expect(balance).toBe('100');
  });

  it('should return transaction bytes for burn and allow external signing', async () => {
    const infoBefore = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = infoBefore.treasury?.toString();

    // Cash in to treasury first so we have tokens to burn
    const cashIn = cashInTool(context, config);
    const cashInResult: any = await cashIn.execute(operatorNonKeyClient, context, {
      tokenId,
      amount: '50',
      targetId: treasuryId,
    });
    expect(cashInResult.raw.bytes).toBeDefined();
    const cashInTx = Transaction.fromBytes(cashInResult.raw.bytes);
    await cashInTx.sign(executorKey);
    await cashInTx.execute(fundingClient);
    await wait(5000);

    const burn = burnTool(context, config);

    const result: any = await burn.execute(operatorNonKeyClient, context, {
      tokenId,
      amount: '40',
    });

    console.log(JSON.stringify(result, null, 2));

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);
    try {
      await transaction.sign(executorKey);
      const response = await transaction.execute(fundingClient);
      await response.getReceipt(fundingClient);
    } catch (error) {
      throw error;
    }

    await wait(5000);

    // Verify
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    expect(info.totalSupply!.toString()).toBe('110'); // 100 (initial) + 50 (extra) - 40
  });

  it('should return transaction bytes for wipe and allow external signing', async () => {
    // 1. Give tokens to another account first (using direct wrapper)
    const targetKey = PrivateKey.generateECDSA();
    const targetAccountId = await executorWrapper.createAccount({
      key: targetKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
    }).then(r => r.accountId!.toString());
    await executorWrapper.waitForAccount(targetAccountId);

    // Associate and transfer tokens
    const targetWrapper = new HederaOperationsWrapper(
      getCustomClient(AccountId.fromString(targetAccountId), targetKey),
      targetKey
    );
    await targetWrapper.associateToken({
      accountId: targetAccountId,
      tokenId: tokenId,
      privateKey: targetKey
    });
    await fundingWrapper.waitForAssociation(targetAccountId, tokenId);

    await executorWrapper.grantKyc({
      targetId: targetAccountId,
      tokenId,
    });
    await executorWrapper.waitForKyc(targetAccountId, tokenId);
    await executorWrapper.transfer({
      tokenId,
      targetId: targetAccountId,
      amount: '20'
    });

    await wait(4000); // Wait for transfer to reflect in mirror node/SDK

    // 2. Use wipe tool in RB mode
    const wipe = wipeTool(context, config);

    const result: any = await wipe.execute(operatorNonKeyClient, context, {
      tokenId,
      targetId: targetAccountId,
      amount: '15',
    });

    console.log(JSON.stringify(result, null, 2))

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);
    try {
      await transaction.sign(executorKey);
      const response = await transaction.execute(fundingClient);
      await response.getReceipt(fundingClient);
    } catch (error) {
      throw error;
    }

    await wait(5000);

    // Verify
    const balance = await executorWrapper.getStablecoinBalance(targetAccountId, tokenId);
    expect(balance).toBe('5'); // 20 - 15
  });
});
