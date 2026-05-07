import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey, Transaction, AccountId } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import associateTool from '@/tools/account/associate-stablecoin';
import getCapabilitiesTool from '@/tools/account/get-stablecoin-capabilities';
import getBalanceTool from '@/tools/account/get-stablecoin-balance';
import freezeTool from '@/tools/account/freeze-account';
import unfreezeTool from '@/tools/account/unfreeze-account';
import grantKycTool from '@/tools/account/grant-kyc';
import revokeKycTool from '@/tools/account/revoke-kyc';
import isAssociatedTool from '@/tools/account/is-account-associated';
import isFrozenTool from '@/tools/account/is-account-frozen';
import isKycGrantedTool from '@/tools/account/is-account-kyc-granted';

describe('Account Return Bytes Mode Integration Tests', () => {
  let operatorClient: Client;
  let executorKey: PrivateKey;
  let executorAccountId: string;
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

    // Create executor account
    executorKey = PrivateKey.generateECDSA();
    executorAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Return Bytes Integration Tests',
      })
      .then((resp) => resp.accountId!.toString());

    await operatorWrapper.waitForAccount(executorAccountId);

    context = {
      mode: AgentMode.RETURN_BYTES,
      accountId: executorAccountId,
    };

    config = {
      accountId: executorAccountId,
      // NO private key in config
    };

    tokenId = await operatorWrapper.createStablecoin({
      name: `RB Account Test ${Date.now()}`,
      symbol: 'RBA',
      config: {
        accountId: operatorClient.operatorAccountId!.toString(),
        privateKey: process.env.PRIVATE_KEY!
      },
      context,
    });

    // Grant roles to executor account
    await operatorWrapper.grantRole({ tokenId, targetId: executorAccountId, role: 'FREEZE_ROLE' as any });
    await operatorWrapper.grantRole({ tokenId, targetId: executorAccountId, role: 'KYC_ROLE' as any });
    await wait(8000);
  });

  afterAll(async () => {
    if (operatorClient) {
      try {
        await operatorWrapper.deleteAccount({
          accountId: AccountId.fromString(executorAccountId),
          transferAccountId: operatorClient.operatorAccountId!,
        });
      } catch (error) {
        console.warn('Failed to clean up executor account:', error);
      }
      operatorClient.close();
    }
  });

  it('should return transaction bytes for association and allow external signing', async () => {
    const associate = associateTool(context, config);

    // 1. Get transaction from tool (RETURN_BYTES mode)
    const result: any = await associate.execute(operatorClient, context, {
      tokenId,
      // targetId should default to context.accountId
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);

    // 2. Externally sign and execute
    await transaction.sign(executorKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);

    // 3. Verify
    await operatorWrapper.waitForAssociation(executorAccountId, tokenId);
    const isAssociated = await operatorWrapper.isTokenAssociated(executorAccountId, tokenId);
    expect(isAssociated).toBe(true);
  });

  it('should allow querying capabilities in RETURN_BYTES mode (should not require signing)', async () => {
    const getCapabilities = getCapabilitiesTool(context, config);

    const result = await getCapabilities.execute(operatorClient, context, {
      tokenId,
      // targetId should default to context.accountId
    });

    expect(result.raw).toBeDefined();
    expect(result.humanMessage).toContain('Capabilities for');
  });

  it('should allow querying balance in RETURN_BYTES mode', async () => {
    const getBalance = getBalanceTool(context, config);

    const result = await getBalance.execute(operatorClient, context, {
      tokenId,
      // targetId should default to context.accountId
    });

    expect(result.raw).toBeDefined();
    expect(result.humanMessage).toContain('Balance of token');
  });

  it('should return transaction bytes for freeze/unfreeze and allow external signing', async () => {
    const freeze = freezeTool(context, config);
    const result: any = await freeze.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);

    // Sign with executor key (payer and role holder)
    await transaction.sign(executorKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);
    await wait(5000);

    // Verify using query tool in RB mode
    const isFrozen = isFrozenTool(context, config);
    const frozenResult = await isFrozen.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });
    expect(frozenResult.humanMessage.toLowerCase()).toContain('is frozen');

    // Unfreeze
    const unfreeze = unfreezeTool(context, config);
    const unfreezeResult: any = await unfreeze.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });
    const unfreezeTx = Transaction.fromBytes(unfreezeResult.raw.bytes);
    await unfreezeTx.sign(executorKey);
    await unfreezeTx.execute(operatorClient);
    await response.getReceipt(operatorClient);
    await wait(5000);

    // Verify
    const unfrozenResult = await isFrozen.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });
    expect(unfrozenResult.humanMessage.toLowerCase()).toContain('is not frozen');
  });

  it('should return transaction bytes for KYC grant/revoke and allow external signing', async () => {
    const grantKyc = grantKycTool(context, config);
    const result: any = await grantKyc.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);

    await transaction.sign(executorKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);
    await wait(5000);

    // Verify using query tool
    const isKycGranted = isKycGrantedTool(context, config);
    const kycResult = await isKycGranted.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });
    expect(kycResult.humanMessage.toLowerCase()).toContain('kyc granted');

    // Revoke
    const revokeKyc = revokeKycTool(context, config);
    const revokeResult: any = await revokeKyc.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });
    const revokeTx = Transaction.fromBytes(revokeResult.raw.bytes);
    await revokeTx.sign(executorKey);
    await revokeTx.execute(operatorClient);
    await response.getReceipt(operatorClient);
    await wait(5000);

    // Verify
    const revokedResult = await isKycGranted.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });
    expect(revokedResult.humanMessage.toLowerCase()).toContain('does not have kyc granted');
  });

  it('should allow querying association status in RETURN_BYTES mode', async () => {
    const isAssociated = isAssociatedTool(context, config);
    const result = await isAssociated.execute(operatorClient, context, {
      tokenId,
      targetId: executorAccountId,
    });

    expect(result.raw).toBeDefined();
    expect(result.humanMessage).toContain('is associated');
  });
});
