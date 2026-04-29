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
import grantSupplierRoleTool from '@/tools/lifecycle/grant-supplier-role';
import revokeSupplierRoleTool from '@/tools/lifecycle/revoke-supplier-role';
import increaseSupplierAllowanceTool from '@/tools/lifecycle/increase-supplier-allowance';

describe('Lifecycle Supplier Return Bytes Mode Integration Tests', () => {
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
        accountMemo: 'admin account for Lifecycle Supplier RB Tests',
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
      name: `RB Supplier Test ${Date.now()}`,
      symbol: 'RBSUP',
      config: {
        accountId: adminAccountId,
        privateKey: adminKey.toStringDer()
      },
      context,
    });
    
    await wait(10000);
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

  it('should return transaction bytes for grant/revoke supplier role and allow external signing', async () => {
    const grantSupplier = grantSupplierRoleTool(context, config);
    const targetAccountId = operatorClient.operatorAccountId!.toString();

    const result: any = await grantSupplier.execute(operatorClient, context, {
      tokenId,
      targetId: targetAccountId,
      amount: '500',
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);
    await transaction.sign(adminKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);

    await wait(10000);

    // Verify allowance
    const allowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId: targetAccountId });
    expect(allowance).toBe('500');

    // Revoke
    const revokeSupplier = revokeSupplierRoleTool(context, config);
    const revokeResult: any = await revokeSupplier.execute(operatorClient, context, {
      tokenId,
      targetId: targetAccountId,
    });
    const revokeTx = Transaction.fromBytes(revokeResult.raw.bytes);
    await revokeTx.sign(adminKey);
    await revokeTx.execute(operatorClient);
    await wait(10000);

    // Verify
    const roles = await operatorWrapper.getRoles({ tokenId, targetId: targetAccountId });
    const hasCashIn = roles.some(r => r === 'CASHIN_ROLE');
    expect(hasCashIn).toBe(false);
  });

  it('should return transaction bytes for increase supplier allowance and allow external signing', async () => {
    const targetId = operatorClient.operatorAccountId!.toString();
    // First grant role using admin account
    const grantSupplier = grantSupplierRoleTool(context, config);
    const grantResult: any = await grantSupplier.execute(operatorClient, context, {
        tokenId,
        targetId,
        amount: '100',
    });
    const grantTx = Transaction.fromBytes(grantResult.raw.bytes);
    await grantTx.sign(adminKey);
    await grantTx.execute(operatorClient);
    await wait(10000);

    const increase = increaseSupplierAllowanceTool(context, config);
    const result: any = await increase.execute(operatorClient, context, {
      tokenId,
      targetId,
      amount: '50',
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);
    await transaction.sign(adminKey);
    await transaction.execute(operatorClient);
    await wait(10000);

    const allowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId });
    expect(allowance).toBe('150');
  });
});
