import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AccountId, Client, PrivateKey, Transaction } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import pauseTool from '@/tools/lifecycle/pause-stablecoin';
import unpauseTool from '@/tools/lifecycle/unpause-stablecoin';
import updateTool from '@/tools/lifecycle/update-stablecoin';
import grantRoleTool from '@/tools/lifecycle/grant-role-stablecoin';
import getStablecoinInfoTool from '@/tools/lifecycle/get-stablecoin-info';

describe('Lifecycle Return Bytes Mode Integration Tests', () => {
  let operatorClient: Client;
  let adminKey: PrivateKey;
  let adminAccountId: string;
  let operatorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    operatorClient = getOperatorClientForTests();
    operatorWrapper = new HederaOperationsWrapper(
      operatorClient,
      PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY! || '')
    );

    // Create admin account
    adminKey = PrivateKey.generateECDSA();
    adminAccountId = await operatorWrapper
      .createAccount({
        key: adminKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'admin account for Lifecycle RB Tests',
      })
      .then((resp) => resp.accountId!.toString());

    await operatorWrapper.waitForAccount(adminAccountId);

    context = {
      mode: AgentMode.RETURN_BYTES,
      accountId: adminAccountId,
    };

    config = {
      accountId: adminAccountId,
    };

    // Create stablecoin with admin account as all roles
    tokenId = await operatorWrapper.createStablecoin({
      name: `RB Lifecycle Test ${Date.now()}`,
      symbol: 'RBL',
      config: {
        accountId: adminAccountId,
        privateKey: adminKey.toStringDer()
      },
      context,
    });
  });

  afterAll(async () => {
    if (operatorClient) {
      try {
        await operatorWrapper.deleteAccount({
          accountId: AccountId.fromString(adminAccountId),
          transferAccountId: operatorClient.operatorAccountId!,
        });
      } catch (error) {
        console.warn('Failed to clean up admin account:', error);
      }
      operatorClient.close();
    }
  });

  it('should return transaction bytes for pause and allow external signing', async () => {
    const pause = pauseTool(context, config);

    const result: any = await pause.execute(operatorClient, context, {
      tokenId,
    });

    expect(result.raw.bytes).toBeDefined();

    const transaction = Transaction.fromBytes(result.raw.bytes);
    console.log('DEBUG transaction type:', transaction.constructor.name);
    console.log('DEBUG transaction.sign type:', typeof transaction.sign);
    await transaction.sign(adminKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);

    await wait(5000);

    const info = await operatorWrapper.getStablecoinInfo(tokenId);
    expect(info.paused).toBe(true);
  });

  it('should return transaction bytes for unpause and allow external signing', async () => {
    const unpause = unpauseTool(context, config);

    const result: any = await unpause.execute(operatorClient, context, {
      tokenId,
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);
    await transaction.sign(adminKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);

    await wait(5000);

    const info = await operatorWrapper.getStablecoinInfo(tokenId);

    expect(info.paused).toBe(false);
  });

  it('should return transaction bytes for update and allow external signing', async () => {
    const update = updateTool(context, config);
    const newName = `Updated RB ${Date.now()}`;

    const result: any = await update.execute(operatorClient, context, {
      tokenId,
      name: newName,
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);
    await transaction.sign(adminKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);

    await wait(5000);

    const info = await operatorWrapper.getStablecoinInfo(tokenId);
    expect(info.name).toBe(newName);
  });

  it('should return transaction bytes for grant role and allow external signing', async () => {
    const grantRole = grantRoleTool(context, config);
    const targetAccountId = operatorClient.operatorAccountId!.toString();

    const result: any = await grantRole.execute(operatorClient, context, {
      tokenId,
      targetId: targetAccountId,
      role: 'CASHIN_ROLE',
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);
    await transaction.sign(adminKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);

    await wait(5000);

    const capabilities = await operatorWrapper.getCapabilities(targetAccountId, tokenId);
    const canCashIn = capabilities.capabilities.some(c => c.operation === 'Cash_in');
    expect(canCashIn).toBe(true);
  });

  it('should allow querying stablecoin info in RETURN_BYTES mode', async () => {
    const getInfo = getStablecoinInfoTool(context, config);
    const result = await getInfo.execute(operatorClient, context, {
      tokenId,
    });

    expect(result.raw).toBeDefined();
    expect(result.humanMessage).toContain('Stablecoin Details for');
  });
});
