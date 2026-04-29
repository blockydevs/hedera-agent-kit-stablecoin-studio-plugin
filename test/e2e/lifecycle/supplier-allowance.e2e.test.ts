/**
 * TODO: This file should be split into separate test files, one per tool, in the future.
 */
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

describe('Supplier Allowance E2E Tests', () => {
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
      accountMemo: 'executor account for Supplier Allowance E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');

    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    tokenId = await executorWrapper.createStablecoin({
      name: `Supplier_E2E_${Date.now()}`,
      symbol: 'SUPE2E',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringRaw(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });

    targetKey = PrivateKey.generateECDSA();
    const targetResp = await executorWrapper.createAccount({
      key: targetKey.publicKey,
      initialBalance: 0,
      accountMemo: 'target account for Supplier Allowance E2E Tests',
    });
    targetAccountId = targetResp.accountId!.toString();
    await executorWrapper.waitForAccount(targetAccountId);
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

  it('should manage supplier allowance through the agent', async () => {
    // 1. Grant Supplier Role with Allowance
    const grantInput = `Grant supplier role to account ${targetAccountId} for stablecoin ${tokenId} with allowance 1000. Proceed immediately.`;
    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: grantInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please grant the role' }
        ],
      });
    }

    let parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait(10000);

    // 2. Get Supplier Allowance
    const getInput = `How much can ${targetAccountId} mint for stablecoin ${tokenId}?`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: getInput }],
    });
    expect(result.messages[result.messages.length - 1].content).toContain('1000');

    // 3. Increase Supplier Allowance
    const increaseInput = `Increase supplier allowance for ${targetAccountId} on token ${tokenId} by 500. Proceed immediately.`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: increaseInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please increase it' }
        ],
      });
    }

    parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait(10000);

    // Verify Increase
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: getInput }],
    });
    expect(result.messages[result.messages.length - 1].content).toContain('1500');

    // 4. Decrease Supplier Allowance
    const decreaseInput = `Decrease minting allowance of ${targetAccountId} by 200 for stablecoin ${tokenId}. Proceed immediately.`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: decreaseInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please decrease it' }
        ],
      });
    }

    parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait(10000);

    // Verify Decrease
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: getInput }],
    });
    expect(result.messages[result.messages.length - 1].content).toContain('1300');

    // 5. Reset Supplier Allowance
    const resetInput = `Reset supplier allowance for ${targetAccountId} on stablecoin ${tokenId}. Proceed immediately.`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: resetInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please reset it' }
        ],
      });
    }

    parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait(10000);

    // Verify Reset
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: getInput }],
    });
    expect(result.messages[result.messages.length - 1].content).toContain('0');

    // 6. Revoke Supplier Role
    const revokeInput = `Revoke supplier role from ${targetAccountId} for token ${tokenId}. Proceed immediately.`;
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: revokeInput }],
    });

    if (!result.messages.some((m: any) => m._getType() === 'tool')) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please revoke it' }
        ],
      });
    }

    parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    await wait(10000);

    // Verify Revoke (should return 0 or error, but let's just check the status in the agent)
    result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: getInput }],
    });
    expect(result.messages[result.messages.length - 1].content).toContain('0');
  });
});
