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

describe('Associate Stablecoin E2E Tests', () => {
  let testSetup: LangchainTestSetup;
  let executorClient: Client;
  let operatorClient: Client;
  let executorWrapper: HederaOperationsWrapper;
  let tokenId: string;
  let creatorAccountId: string;
  let creatorKey: PrivateKey;

  beforeAll(async () => {
    await UsdToHbarService.initialize();

    const baseSetup = await createLangchainTestSetup();
    operatorClient = baseSetup.client;
    const operatorWrapper = new HederaOperationsWrapper(operatorClient);

    // Create creator account
    creatorKey = PrivateKey.generateECDSA();
    const creatorResp = await operatorWrapper.createAccount({
      key: creatorKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
      accountMemo: 'creator account for Associate Stablecoin E2E Tests',
    });
    creatorAccountId = creatorResp.accountId!.toString();
    await operatorWrapper.waitForAccount(creatorAccountId);

    const creatorClient = Client.forTestnet().setOperator(creatorResp.accountId!, creatorKey);
    const creatorWrapper = new HederaOperationsWrapper(creatorClient, creatorKey);

    // Create executor account
    const executorAccountKey = PrivateKey.generateECDSA();
    const resp = await operatorWrapper.createAccount({
      key: executorAccountKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
      accountMemo: 'executor account for Associate Stablecoin E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    // Create a stablecoin using creator account so it's not automatically associated with executor
    tokenId = await creatorWrapper.createStablecoin({
      name: `E2E Associate ${Date.now()}`,
      symbol: 'E2EA',
      config: {
        accountId: creatorAccountId,
        privateKey: creatorKey.toStringDer()
      },
      context: {
        accountId: creatorAccountId
      }
    });

    creatorClient.close();
    await wait();
  });

  afterAll(async () => {
    if (executorClient && operatorClient) {
      try {
        if (creatorAccountId && creatorKey) {
          const creatorClient = Client.forTestnet().setOperator(creatorAccountId, creatorKey);
          const creatorWrapper = new HederaOperationsWrapper(creatorClient, creatorKey);
          await creatorWrapper.teardownAccount({
            accountId: creatorAccountId,
            transferAccountId: operatorClient.operatorAccountId!.toString(),
          });
          creatorClient.close();
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

  it('should associate the agent account with the stablecoin', async () => {
    const input = `Associate my account with the stablecoin ${tokenId}. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please associate it' }
        ],
      });
    }

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');

    await wait();

    const isAssociated = await executorWrapper.isTokenAssociated(
      executorClient.operatorAccountId!.toString(),
      tokenId
    );
    expect(isAssociated).toBe(true);
  });
});
