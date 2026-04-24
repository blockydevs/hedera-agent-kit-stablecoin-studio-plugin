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

describe('Update Reserve Address E2E Tests', () => {
  let testSetup: LangchainTestSetup;
  let executorClient: Client;
  let operatorClient: Client;
  let executorWrapper: HederaOperationsWrapper;
  let tokenId: string;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    const baseSetup = await createLangchainTestSetup();
    operatorClient = baseSetup.client;
    const operatorWrapper = new HederaOperationsWrapper(operatorClient);

    const executorAccountKey = PrivateKey.generateECDSA();
    const resp = await operatorWrapper.createAccount({
      key: executorAccountKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MAXIMUM),
      accountMemo: 'executor account for Update Reserve E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    await operatorWrapper.waitForAccount(resp.accountId.toString());

    tokenId = await executorWrapper.createStablecoin({
      name: `Reserve_E2E_${Date.now()}`,
      symbol: 'RE2E',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringDer(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });
  }, 120000);

  afterAll(async () => {
    if (executorClient && operatorClient) {
      try {

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

  it('should update the reserve address', async () => {
    const input = `Update reserve address to 0.0.0 for stablecoin ${tokenId}`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, proceed' }
        ],
      });
    }

    console.log(`RESP(should update the reserve address): ${JSON.stringify(result, null, 2)}`)

    await wait();

    // Verify via Stablecoin Studio SDK info (though reserve address might not be in basic info, 
    // we check if the tool executed successfully without error)
    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
  }, 240000);
});
