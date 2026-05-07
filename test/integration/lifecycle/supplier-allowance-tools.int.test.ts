/**
 * TODO: This file should be split into separate test files, one per tool, in the future.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import { StableCoinRole } from '@hashgraph/stablecoin-npm-sdk';
import {
  getOperatorClientForTests,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import increaseSupplierAllowanceTool from '@/tools/lifecycle/increase-supplier-allowance';
import decreaseSupplierAllowanceTool from '@/tools/lifecycle/decrease-supplier-allowance';
import resetSupplierAllowanceTool from '@/tools/lifecycle/reset-supplier-allowance';
import grantSupplierRoleTool from '@/tools/lifecycle/grant-supplier-role';
import revokeSupplierRoleTool from '@/tools/lifecycle/revoke-supplier-role';
import getSupplierAllowanceTool from '@/tools/lifecycle/get-supplier-allowance';

describe('Supplier Allowance Tools Integration Tests', () => {
  let operatorClient: Client;
  let operatorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;
  let targetId: string;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    operatorClient = getOperatorClientForTests();
    operatorWrapper = new HederaOperationsWrapper(
      operatorClient,
      PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY || ''),
    );

    // Create executor account
    const executorKey = PrivateKey.generateECDSA();
    const targetAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Revoke Role Integration Tests',
      })
      .then(resp => resp.accountId!);

    await operatorWrapper.waitForAccount(targetAccountId.toString());

    context = {
      mode: AgentMode.AUTONOMOUS,
      accountId: operatorClient.operatorAccountId!.toString(),
    };

    config = {
      accountId: operatorClient.operatorAccountId!.toString(),
      privateKey: process.env.PRIVATE_KEY!,
    };

    // Create a stablecoin for all tests in this suite
    tokenId = await operatorWrapper.createStablecoin({
      name: `Tool Test ${Date.now()}`,
      symbol: 'TLT',
      config: {
        decimals: 2,
      },
      context,
    });

    targetId = targetAccountId.toString();

  });

  afterAll(async () => {
    if (operatorClient) {
      operatorClient.close();
    }
  });

  it('should increase supplier allowance using increaseSupplierAllowanceTool', async () => {
    // Initial grant to make it a supplier (limited with 0 initial allowance)
    await operatorWrapper.grantRole({
      tokenId,
      targetId,
      role: StableCoinRole.CASHIN_ROLE,
      supplierType: 'limited',
      amount: '1',
    });

    // Wait for mirror node to pick up the role
    await wait(10000);

    // 1. Get initial allowance
    const initialAllowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId });

    console.log(`Initial allowance for ${targetId} on ${tokenId}: ${initialAllowance}`);

    const increaseTool = increaseSupplierAllowanceTool(context, config);

    // Wait for mirror node to pick up the role
    await wait(10000);

    // 2. Increase allowance
    const amountToIncrease = '100';
    const result: any = await increaseTool.execute(operatorClient, context, {
      tokenId,
      targetId,
      amount: amountToIncrease,
    });

    console.log(JSON.stringify(result, null, 2));

    expect(result.raw.status.toString()).toBe('SUCCESS');

    // 3. Wait for mirror node and verify
    await wait(10000);
    const newAllowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId });
    expect(Number(newAllowance)).toBe(Number(initialAllowance) + Number(amountToIncrease));
  });

  it('should decrease supplier allowance using decreaseSupplierAllowanceTool', async () => {
    const decreaseTool = decreaseSupplierAllowanceTool(context, config);

    // 1. Ensure we have some allowance to decrease
    await operatorWrapper.increaseSupplierAllowance({ tokenId, targetId, amount: '50' });
    await wait(10000);
    const initialAllowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId });

    // 2. Decrease allowance
    const amountToDecrease = '20';
    const result: any = await decreaseTool.execute(operatorClient, context, {
      tokenId,
      targetId,
      amount: amountToDecrease,
    });

    expect(result.raw.status.toString()).toBe('SUCCESS');

    // 3. Wait for mirror node and verify
    await wait(10000);
    const newAllowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId });
    expect(Number(newAllowance)).toBe(Number(initialAllowance) - Number(amountToDecrease));
  }, 60000);

  it('should reset supplier allowance using resetSupplierAllowanceTool', async () => {
    const resetTool = resetSupplierAllowanceTool(context, config);

    // 1. Ensure we have some allowance to reset
    await operatorWrapper.increaseSupplierAllowance({ tokenId, targetId, amount: '30' });
    await wait(10000);
    const allowanceBeforeReset = await operatorWrapper.getSupplierAllowance({ tokenId, targetId });
    expect(Number(allowanceBeforeReset)).toBeGreaterThan(0);

    // 2. Reset allowance
    const result: any = await resetTool.execute(operatorClient, context, {
      tokenId,
      targetId,
    });

    expect(result.raw.status.toString()).toBe('SUCCESS');

    // 3. Wait for mirror node and verify
    await wait(10000);
    const finalAllowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId });
    expect(Number(finalAllowance)).toBe(0);
  });

  it('should grant supplier role using grantSupplierRoleTool', async () => {
    const grantTool = grantSupplierRoleTool(context, config);
    const allowance = '500';
    const newTargetId = '0.0.1';

    const result: any = await grantTool.execute(operatorClient, context, {
      tokenId,
      targetId: newTargetId,
      amount: allowance,
    });

    expect(result.raw.status.toString()).toBe('SUCCESS');

    await wait(10000);
    const currentAllowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId: newTargetId });
    expect(Number(currentAllowance)).toBe(Number(allowance));
  });

  it('should get supplier allowance using getSupplierAllowanceTool', async () => {
    const getTool = getSupplierAllowanceTool(context, config);

    const result: any = await getTool.execute(operatorClient, context, {
      tokenId,
      targetId,
    });

    expect(result.raw.allowance).toBeDefined();
  });

  it('should revoke supplier role using revokeSupplierRoleTool', async () => {
    const revokeTool = revokeSupplierRoleTool(context, config);
    const targetToRevoke = '0.0.1';

    const result: any = await revokeTool.execute(operatorClient, context, {
      tokenId,
      targetId: targetToRevoke,
    });

    expect(result.raw.status.toString()).toBe('SUCCESS');

    await wait(10000);
    const currentAllowance = await operatorWrapper.getSupplierAllowance({ tokenId, targetId: targetToRevoke });
    expect(Number(currentAllowance)).toBe(0);
  });
});
