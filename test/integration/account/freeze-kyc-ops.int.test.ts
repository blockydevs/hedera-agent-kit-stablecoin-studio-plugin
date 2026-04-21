import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey, AccountId } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  getCustomClient,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import { initSdk, connectSdk } from '@/stablecoin-sdk-utils';
import freezeTool from '@/tools/account/freeze-account';
import unfreezeTool from '@/tools/account/unfreeze-account';
import isFrozenTool from '@/tools/account/is-account-frozen';
import grantKycTool from '@/tools/account/grant-kyc';
import revokeKycTool from '@/tools/account/revoke-kyc';
import isKycGrantedTool from '@/tools/account/is-account-kyc-granted';

describe('Freeze and KYC Operations Integration Tests', () => {
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
        accountMemo: 'executor account for Freeze KYC Integration Tests',
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

    // 1. Create a stablecoin with freeze and KYC roles
    tokenId = await executorWrapper.createStablecoin({
      name: `Freeze KYC Test ${Date.now()}`,
      symbol: 'FKR',
      config,
      context,
    });

    // 2. Create a test account
    const newKey = PrivateKey.generateECDSA();
    userAccountId = await executorWrapper
      .createAccount({
        key: newKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
        accountMemo: 'freeze/kyc target account',
      })
      .then((resp) => resp.accountId!.toString());

    await executorWrapper.waitForAccount(userAccountId);

    // 3. Associate the test account properly using its own key
    const userWrapper = new HederaOperationsWrapper(
      getCustomClient(AccountId.fromString(userAccountId), newKey),
      newKey
    );
    await userWrapper.associateToken({ accountId: userAccountId, tokenId, privateKey: newKey });
    await userWrapper.waitForAssociation(userAccountId, tokenId);

    await wait(); // Additional safety wait for consistency across SDK handlers
    
    const network = 'testnet';
    await initSdk(network, config);
    await connectSdk(network, config, context);
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

  it('should manage account freeze status', async () => {
    const isFrozen = isFrozenTool(context, config);
    const freeze = freezeTool(context, config);
    const unfreeze = unfreezeTool(context, config);

    // Initial status
    let statusRes: any = await isFrozen.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    expect(statusRes.raw.isFrozen).toBe(false);

    // Freeze
    await freeze.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    await wait();

    statusRes = await isFrozen.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    expect(statusRes.raw.isFrozen).toBe(true);

    // Unfreeze
    await unfreeze.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    await wait(10000); // More time for mirror node

    statusRes = await isFrozen.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    expect(statusRes.raw.isFrozen).toBe(false);
  });

  it('should manage account KYC status', async () => {
    const isKycGranted = isKycGrantedTool(context, config);
    const grantKyc = grantKycTool(context, config);
    const revokeKyc = revokeKycTool(context, config);

    // Grant KYC
    const grantRes: any = await grantKyc.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    expect(grantRes.humanMessage).toContain('Successfully granted KYC to account for stablecoin');
    await wait();

    let statusRes: any = await isKycGranted.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    expect(statusRes.raw.isKycGranted).toBe(true);

    // Revoke KYC
    await revokeKyc.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    await wait();

    statusRes = await isKycGranted.execute(executorClient, context, {
      tokenId,
      targetId: userAccountId,
    });
    expect(statusRes.raw.isKycGranted).toBe(false);
  });
});
