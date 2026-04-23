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
  let reserveAccountId: string;

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

    tokenId = await executorWrapper.createStablecoin({
      name: `Reserve_E2E_${Date.now()}`,
      symbol: 'RE2E',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringRaw(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });

    const reserveKey = PrivateKey.generateECDSA();
    const reserveResp = await executorWrapper.createAccount({
        key: reserveKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
        accountMemo: 'reserve account for Update Reserve E2E Tests',
    });
    reserveAccountId = reserveResp.accountId!.toString();
    await executorWrapper.waitForAccount(reserveAccountId);
  }, 120000);

  afterAll(async () => {
    if (testSetup) {
      testSetup.cleanup();
    }
    if (operatorClient) operatorClient.close();
  });

  it('should update the reserve address', async () => {
    const input = `Update reserve address to ${reserveAccountId} for stablecoin ${tokenId}`;

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

    await wait();

    // Verify via Stablecoin Studio SDK info (though reserve address might not be in basic info, 
    // we check if the tool executed successfully without error)
    expect(result.messages[result.messages.length - 1].content).toContain('Reserve address updated successfully');
  }, 240000);
});
