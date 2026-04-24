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

describe('Hold Stablecoin E2E Tests', () => {
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
      accountMemo: 'executor account for Hold Stablecoin E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    tokenId = await executorWrapper.createStablecoin({
      name: `E2E Hold ${Date.now()}`,
      symbol: 'E2EH',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringDer(),
      },
      context: {
        mode: (testSetup.toolkit.getTools()[0] as any).context?.mode || 'AUTONOMOUS',
        accountId: resp.accountId.toString(),
      },
    });

    // Explicitly associate the executor account
    await executorWrapper
      .associateToken({
        tokenId,
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey,
      })
      .catch(() => {});
    await executorWrapper.waitForAssociation(resp.accountId.toString(), tokenId);
    await wait(10000);

    // Grant KYC to executor
    await executorWrapper.grantKyc({
      targetId: resp.accountId.toString(),
      tokenId,
    });
    await executorWrapper.waitForKyc(resp.accountId.toString(), tokenId);

    // Cash in tokens
    await executorWrapper.cashIn({
      tokenId,
      targetId: resp.accountId.toString(),
      amount: '1000',
    });

    await wait();
  }, 240000);

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

  it('should create a hold via agent', async () => {
    const expirationDate = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const input = `I want to create a hold of 50 tokens for stablecoin ${tokenId}. The escrow is ${executorClient.operatorAccountId!.toString()} and it expires at ${expirationDate}. Proceed immediately.`;

    const initialBalance = await executorWrapper.getStablecoinBalance(executorClient.operatorAccountId!.toString(), tokenId);

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please create the hold' }
        ],
      });
    }

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');

    await wait();

    const balanceAfterHold = await executorWrapper.getStablecoinBalance(executorClient.operatorAccountId!.toString(), tokenId);
    expect(Number(balanceAfterHold)).toBe(Number(initialBalance) - 50);
  }, 240000);

  it('should execute a hold via agent', async () => {
    // 1. Create a hold via wrapper to get holdId
    const expirationDate = Math.floor(Date.now() / 1000) + 3600;
    const createRes = await executorWrapper.createHold({
      tokenId,
      amount: '30',
      escrow: executorClient.operatorAccountId!.toString(),
      expirationDate: expirationDate.toString(),
    });
    const holdId = createRes.holdId;

    await wait();

    const balanceBeforeExec = await executorWrapper.getStablecoinBalance(executorClient.operatorAccountId!.toString(), tokenId);

    // 2. Ask the agent to execute the hold
    const input = `Execute the hold with ID ${holdId} for stablecoin ${tokenId}. The amount is 30, the source is ${executorClient.operatorAccountId!.toString()} and the target is ${executorClient.operatorAccountId!.toString()}. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please execute it' }
        ],
      });
    }

    console.log(`RESP(should execute a hold via agent): ${JSON.stringify(result, null, 2)}`);

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');

    await wait();

    const finalBalance = await executorWrapper.getStablecoinBalance(executorClient.operatorAccountId!.toString(), tokenId);
    // Tokens were held (removed from balance) and now executed (returned to target, which is executor by default or same as source in this case)
    expect(Number(finalBalance)).toBe(Number(balanceBeforeExec) + 30);
  }, 240000);

  it('should release a hold via agent', async () => {
    // 1. Create a hold via wrapper
    const expirationDate = Math.floor(Date.now() / 1000) + 3600;
    const createRes = await executorWrapper.createHold({
      tokenId,
      amount: '20',
      escrow: executorClient.operatorAccountId!.toString(),
      expirationDate: expirationDate.toString(),
    });
    const holdId = createRes.holdId;

    await wait();

    const balanceBeforeRelease = await executorWrapper.getStablecoinBalance(executorClient.operatorAccountId!.toString(), tokenId);

    // 2. Ask agent to release the hold
    const input = `Release the hold with ID ${holdId} for stablecoin ${tokenId}. The amount is 20 and the source is ${executorClient.operatorAccountId!.toString()}. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please release it' }
        ],
      });
    }

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');

    await wait();

    const finalBalance = await executorWrapper.getStablecoinBalance(executorClient.operatorAccountId!.toString(), tokenId);
    expect(Number(finalBalance)).toBe(Number(balanceBeforeRelease) + 20);
  }, 240000);
});
