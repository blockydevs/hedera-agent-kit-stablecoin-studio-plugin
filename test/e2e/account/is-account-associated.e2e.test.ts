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

describe('Is Account Associated E2E Tests', () => {
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
      accountMemo: 'executor account for IsAssociated E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    tokenId = await executorWrapper.createStablecoin({
      name: `E2E IsAssoc ${Date.now()}`,
      symbol: 'E2EIA',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringDer(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });

    // Create a target account that is NOT associated
    targetKey = PrivateKey.generateECDSA();
    const targetResp = await operatorWrapper.createAccount({
      key: targetKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
      accountMemo: 'target account for IsAssociated E2E Tests',
    });
    targetAccountId = targetResp.accountId!.toString();
    await operatorWrapper.waitForAccount(targetAccountId);

    await wait();
  }, 240000);

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

  it('should check if an account is associated with a stablecoin via agent', async () => {
    // 1. Check - should be NOT associated
    const checkInput = `Is account ${targetAccountId} associated with stablecoin ${tokenId}?`;
    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: checkInput }],
    });
    expect(result.messages[result.messages.length - 1].content.toLowerCase()).toContain('not associated');

    // 2. Associate (manually to avoid complex agent multi-turn for target association if needed, 
    // or we can just test the "is associated" tool's reporting after manual association)
    const targetClient = Client.forTestnet().setOperator(targetAccountId, targetKey);
    const targetWrapper = new HederaOperationsWrapper(targetClient, targetKey);
    await targetWrapper.associateToken({
      tokenId,
      accountId: targetAccountId,
      privateKey: targetKey
    });
    await targetWrapper.waitForAssociation(targetAccountId, tokenId);
    targetClient.close();
    await wait();

    // 3. Check again - should be associated
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: checkInput }],
    });
    expect(result.messages[result.messages.length - 1].content.toLowerCase()).not.toContain('not associated');
    expect(result.messages[result.messages.length - 1].content.toLowerCase()).toContain('associated');
  }, 360000);
});
