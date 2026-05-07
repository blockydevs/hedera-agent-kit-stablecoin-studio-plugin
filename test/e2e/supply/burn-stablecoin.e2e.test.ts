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

describe('Burn Stablecoin E2E Tests', () => {
  let testSetup: LangchainTestSetup;
  let executorClient: Client;
  let operatorClient: Client;
  let executorWrapper: HederaOperationsWrapper;
  let tokenId: string;

  beforeAll(async () => {
    await UsdToHbarService.initialize();

    // Setup operator
    const baseSetup = await createLangchainTestSetup();
    operatorClient = baseSetup.client;
    const operatorWrapper = new HederaOperationsWrapper(operatorClient);

    // Create executor account
    const executorAccountKey = PrivateKey.generateECDSA();
    const resp = await operatorWrapper.createAccount({
      key: executorAccountKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
      accountMemo: 'executor account for Burn Stablecoin E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    // Initialize Langchain setup for executor
    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    // Create a stablecoin for testing
    tokenId = await executorWrapper.createStablecoin({
      name: `E2E Burn ${Date.now()}`,
      symbol: 'E2EB',
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
    }).catch(() => { }); // might already be associated
    await executorWrapper.waitForAssociation(resp.accountId.toString(), tokenId);
    await wait(20000);

    // Grant KYC to executor
    await executorWrapper.grantKyc({
      targetId: resp.accountId.toString(),
      tokenId,
    });
    await executorWrapper.waitForKyc(resp.accountId.toString(), tokenId);
    await wait(10000);

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();
    console.log(`DEBUG: Token ${tokenId} created. Treasury: ${treasuryId}, Executor: ${resp.accountId.toString()}`);

    // Cash in tokens to the TREASURY to have supply to burn
    await executorWrapper.cashIn({
      tokenId,
      targetId: treasuryId,
      amount: '1000'
    });

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

  it('should burn tokens from treasury via agent', async () => {
    const amountToBurn = '100';
    const input = `I want to burn ${amountToBurn} tokens of the stablecoin ${tokenId}. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    // Check if it already called the tool or needs confirmation
    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, I am sure' }
        ],
      });
    }

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');

    await wait();

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();
    const balance = await executorWrapper.getStablecoinBalance(treasuryId, tokenId);

    // Initial supply was 1000, burned 100, should be 900
    expect(balance.toString()).toBe('900');
  });
});
