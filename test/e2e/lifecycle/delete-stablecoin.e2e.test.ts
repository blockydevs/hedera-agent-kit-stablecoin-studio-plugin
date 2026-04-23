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

describe('Delete Stablecoin E2E Tests', () => {
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
        accountMemo: 'executor account for Delete Stablecoin E2E Tests',
    });
    
    if (!resp.accountId) throw new Error('Failed to create executor account');

    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    tokenId = await executorWrapper.createStablecoin({
      name: `Delete_E2E_${Date.now()}`,
      symbol: 'DE2E',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringRaw(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });
  }, 120000);

  afterAll(async () => {
    if (testSetup) {
      testSetup.cleanup();
    }
    if (operatorClient) operatorClient.close();
  });

  it('should delete the stablecoin', async () => {
    const input = `Permanently delete stablecoin ${tokenId}`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');
    
    if (!toolCalled) {
        await testSetup.agent.invoke({
            messages: [
                ...result.messages,
                { role: 'user', content: 'yes, I am sure' }
            ],
        });
    }

    await wait();

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    expect(info.deleted).toBe(true);
  }, 240000);
});
