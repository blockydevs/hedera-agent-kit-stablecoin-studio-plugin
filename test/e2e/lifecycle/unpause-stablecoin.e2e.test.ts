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

describe('Unpause Stablecoin E2E Tests', () => {
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
        accountMemo: 'executor account for Unpause Stablecoin E2E Tests',
    });
    
    if (!resp.accountId) throw new Error('Failed to create executor account');

    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    tokenId = await executorWrapper.createStablecoin({
      name: `Unpause_E2E_${Date.now()}`,
      symbol: 'UPE2E',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringRaw(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });

    // Pause it first using wrapper
    await executorWrapper.pauseStablecoin({ tokenId });
    await wait();
  }, 120000);

  afterAll(async () => {
    if (testSetup) {
      testSetup.cleanup();
    }
    if (operatorClient) operatorClient.close();
  });

  it('should unpause the stablecoin', async () => {
    const input = `Unpause stablecoin ${tokenId}`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');
    
    if (!toolCalled) {
        await testSetup.agent.invoke({
            messages: [
                ...result.messages,
                { role: 'user', content: 'yes' }
            ],
        });
    }

    await wait();

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    expect(info.paused).toBe(false);
  }, 240000);
});
