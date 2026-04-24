import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { Client, PrivateKey } from '@hiero-ledger/sdk';
import {
  createLangchainTestSetup,
  LangchainTestSetup
} from '../setup';
import { StableCoinRole } from '@hashgraph/stablecoin-npm-sdk';
import {
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait
} from '../../integration/test-utils';

describe('Revoke Role Stablecoin E2E Tests', () => {
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
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MAXIMUM),
      accountMemo: 'executor account for Revoke Role E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    await operatorWrapper.waitForAccount(resp.accountId.toString());

    tokenId = await executorWrapper.createStablecoin({
      name: `Revoke_Role_E2E_${Date.now()}`,
      symbol: 'RRE2E',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringDer(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });

    targetKey = PrivateKey.generateECDSA();
    const targetResp = await executorWrapper.createAccount({
      key: targetKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
      accountMemo: 'target account for Revoke Role E2E Tests',
    });
    targetAccountId = targetResp.accountId!.toString();
    await executorWrapper.waitForAccount(targetAccountId);

    // Grant role first
    await executorWrapper.grantRole({
      tokenId,
      targetId: targetAccountId,
      role: 'BURN_ROLE',
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

  it('should revoke BURN_ROLE from an account', async () => {
    const input = `Revoke BURN_ROLE from account ${targetAccountId} for stablecoin ${tokenId}`;

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

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    expect(parsedResponse[0].parsedData.humanMessage.toLowerCase()).toContain('successfully');

    // Wait and retry for mirror node consistency
    let hasBurnRole = true;
    for (let i = 0; i < 5; i++) {
      await wait(5000);
      hasBurnRole = await executorWrapper.hasRole(targetAccountId, tokenId, StableCoinRole.BURN_ROLE);
      if (!hasBurnRole) break;
      console.log(`Retry ${i + 1}: BURN_ROLE still present, waiting...`);
    }

    expect(hasBurnRole).toBe(false);
  });
});
