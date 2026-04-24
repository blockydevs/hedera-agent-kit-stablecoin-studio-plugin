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

describe('Freeze Account E2E Tests', () => {
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
      accountMemo: 'executor account for Freeze E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    tokenId = await executorWrapper.createStablecoin({
      name: `E2E Freeze ${Date.now()}`,
      symbol: 'E2EF',
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
      accountMemo: 'target account for Freeze E2E Tests',
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

  it('should freeze and unfreeze an account via agent', async () => {
    // 1. Freeze
    const freezeInput = `Freeze account ${targetAccountId} for stablecoin ${tokenId}. Proceed immediately.`;
    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: freezeInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [...result.messages, { role: 'user', content: 'yes, freeze it' }],
      });
    }

    expect(testSetup.responseParser.parseNewToolMessages(result)[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait();

    // 2. Check if frozen
    const checkInput = `Is account ${targetAccountId} frozen for stablecoin ${tokenId}?`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: checkInput }],
    });
    expect(result.messages[result.messages.length - 1].content.toLowerCase()).toContain('frozen');

    // 3. Unfreeze
    const unfreezeInput = `Unfreeze account ${targetAccountId} for stablecoin ${tokenId}. Proceed immediately.`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: unfreezeInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [...result.messages, { role: 'user', content: 'yes, unfreeze it' }],
      });
    }

    expect(testSetup.responseParser.parseNewToolMessages(result)[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait();

    // 4. Check if not frozen
    const checkInput2 = `Is account ${targetAccountId} frozen for stablecoin ${tokenId}?`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: checkInput2 }],
    });
    expect(result.messages[result.messages.length - 1].content.toLowerCase()).toContain('not frozen');
  });
});
