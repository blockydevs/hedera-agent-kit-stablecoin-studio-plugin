import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { Client, PrivateKey } from '@hiero-ledger/sdk';
import {
  createLangchainTestSetup,
  LangchainTestSetup
} from '../setup';
import {
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait
} from '../../integration/test-utils';

describe('Grant KYC E2E Tests', () => {
  let testSetup: LangchainTestSetup;
  let executorClient: Client;
  let operatorClient: Client;
  let executorWrapper: HederaOperationsWrapper;
  let tokenId: string;
  let targetAccountId: string;
  let targetKey: PrivateKey;

  beforeAll(async () => {
    await UsdToHbarService.initialize();

    const baseSetup = await createLangchainTestSetup();
    operatorClient = baseSetup.client;
    const operatorWrapper = new HederaOperationsWrapper(operatorClient);

    const executorAccountKey = PrivateKey.generateECDSA();
    const resp = await operatorWrapper.createAccount({
      key: executorAccountKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
      accountMemo: 'executor account for KYC E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    tokenId = await executorWrapper.createStablecoin({
      name: `E2E KYC ${Date.now()}`,
      symbol: 'E2EKYC',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringDer(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });

    // Create and associate target account
    targetKey = PrivateKey.generateECDSA();
    const targetResp = await operatorWrapper.createAccount({
      key: targetKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
      accountMemo: 'target account for KYC E2E Tests',
    });
    targetAccountId = targetResp.accountId!.toString();
    await operatorWrapper.waitForAccount(targetAccountId);

    const targetClient = Client.forTestnet().setOperator(targetResp.accountId!, targetKey);
    const targetWrapper = new HederaOperationsWrapper(targetClient, targetKey);
    await targetWrapper.associateToken({
      tokenId,
      accountId: targetAccountId,
      privateKey: targetKey
    });
    await targetWrapper.waitForAssociation(targetAccountId, tokenId);

    await wait();
  });

  afterAll(async () => {
    if (executorClient && operatorClient) {
      try {
        if (targetAccountId && targetKey) {
          const targetClient = Client.forTestnet().setOperator(targetAccountId, targetKey);
          const targetWrapper = new HederaOperationsWrapper(targetClient, targetKey);
          await targetWrapper.teardownAccount({
            accountId: targetAccountId,
            transferAccountId: operatorClient.operatorAccountId!.toString(),
          });
          targetClient.close();
        }
        await executorWrapper.teardownAccount({
          accountId: executorClient.operatorAccountId!.toString(),
          transferAccountId: operatorClient.operatorAccountId!.toString(),
        });
      } catch (error) {
        console.warn('Failed to clean up accounts:', error);
      }
    }
    if (testSetup) {
      testSetup.cleanup();
    }
    if (operatorClient) operatorClient.close();
  });

  it('should grant and revoke KYC for an account via agent', async () => {
    // 1. Grant KYC
    const grantInput = `Grant KYC to account ${targetAccountId} for stablecoin ${tokenId}. Proceed immediately.`;
    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: grantInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [...result.messages, { role: 'user', content: 'yes, grant it' }],
      });
    }

    expect(testSetup.responseParser.parseNewToolMessages(result)[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait();

    // 2. Check if KYC granted
    const checkInput = `Does account ${targetAccountId} have KYC granted for stablecoin ${tokenId}?`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: checkInput }],
    });
    expect(result.messages[result.messages.length - 1].content.toLowerCase()).toContain('has kyc granted');

    // 3. Revoke KYC
    const revokeInput = `Revoke KYC from account ${targetAccountId} for stablecoin ${tokenId}. Proceed immediately.`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: revokeInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [...result.messages, { role: 'user', content: 'yes, revoke it' }],
      });
    }

    expect(testSetup.responseParser.parseNewToolMessages(result)[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait();

    // 4. Check if KYC not granted
    const checkInput2 = `Does account ${targetAccountId} have KYC granted for stablecoin ${tokenId}?`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: checkInput2 }],
    });
    expect(result.messages[result.messages.length - 1].content.toLowerCase()).toContain('does not have kyc');
  });
});
