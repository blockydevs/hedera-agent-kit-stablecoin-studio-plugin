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

describe('Wipe Stablecoin E2E Tests', () => {
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
      accountMemo: 'executor account for Wipe Stablecoin E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    tokenId = await executorWrapper.createStablecoin({
      name: `E2E Wipe ${Date.now()}`,
      symbol: 'E2EW',
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

    // Create target account
    targetKey = PrivateKey.generateECDSA();
    const targetResp = await operatorWrapper.createAccount({
      key: targetKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
      accountMemo: 'target account for Wipe E2E Test',
    });
    targetAccountId = targetResp.accountId!.toString();
    await operatorWrapper.waitForAccount(targetAccountId);

    // Associate target account
    const targetClient = Client.forTestnet().setOperator(targetResp.accountId!, targetKey);
    const targetWrapper = new HederaOperationsWrapper(targetClient, targetKey);
    await targetWrapper.associateToken({
      accountId: targetAccountId,
      tokenId,
      privateKey: targetKey
    });
    await targetWrapper.waitForAssociation(targetAccountId, tokenId);

    // Grant KYC to target
    await executorWrapper.grantKyc({
      targetId: targetAccountId,
      tokenId,
    });
    await executorWrapper.waitForKyc(targetAccountId, tokenId);

    // Cash in tokens to target
    await executorWrapper.cashIn({
      tokenId,
      amount: '100',
      targetId: targetAccountId
    });

    await wait();
  });

  afterAll(async () => {
    if (executorClient && operatorClient) {
      try {
        // Clean up target account if it exists
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

  it('should wipe tokens from the target account via agent', async () => {
    const amountToWipe = '50';
    const input = `I want to wipe ${amountToWipe} tokens of the stablecoin ${tokenId} from account ${targetAccountId}. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

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

    await wait();

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('wiped');

    const balance = await executorWrapper.getStablecoinBalance(targetAccountId, tokenId);
    // Started with 100, wiped 50, should be 50
    expect(balance.toString()).toBe('50');
  });
});
