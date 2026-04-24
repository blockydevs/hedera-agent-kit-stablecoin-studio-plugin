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

describe('Cash-in Stablecoin E2E Tests', () => {
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
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
      accountMemo: 'executor account for Cash-in Stablecoin E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    tokenId = await executorWrapper.createStablecoin({
      name: `E2E CashIn ${Date.now()}`,
      symbol: 'E2EC',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringDer()
      },
      context: {
        mode: (testSetup.toolkit.getTools()[0] as any).context?.mode || 'AUTONOMOUS',
        accountId: resp.accountId.toString()
      }
    });

    // Explicitly associate the executor account
    await executorWrapper.associateToken({
      tokenId,
      accountId: resp.accountId.toString(),
      privateKey: executorAccountKey
    }).catch(() => { });
    await executorWrapper.waitForAssociation(resp.accountId.toString(), tokenId);
    await wait(10000);

    // Grant KYC to executor
    await executorWrapper.grantKyc({
      targetId: resp.accountId.toString(),
      tokenId,
    });
    await executorWrapper.waitForKyc(resp.accountId.toString(), tokenId);

    await wait();
  });

  afterAll(async () => {
    if (executorClient && operatorClient) {
      try {
        await executorWrapper.teardownAccount({
          accountId: executorClient.operatorAccountId!.toString(),
          transferAccountId: operatorClient.operatorAccountId!.toString(),
        });
      } catch (error) {
        console.warn('Failed to clean up executor account:', error);
      }
    }
    if (testSetup) {
      testSetup.cleanup();
    }
    if (operatorClient) operatorClient.close();
  });

  it('should cash-in tokens to the executor account via agent', async () => {
    const amountToMint = '500';
    const input = `I want to cash in ${amountToMint} tokens of the stablecoin ${tokenId} to my account. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please mint them' }
        ],
      });
    }

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');

    await wait();

    const balance = await executorWrapper.getStablecoinBalance(executorClient.operatorAccountId!.toString(), tokenId);
    expect(balance.toString()).toBe('500');
  });
});
