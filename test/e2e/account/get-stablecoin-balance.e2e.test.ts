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

describe('Get Stablecoin Balance E2E Tests', () => {
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
      accountMemo: 'executor account for Balance E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    tokenId = await executorWrapper.createStablecoin({
      name: `E2E Balance ${Date.now()}`,
      symbol: 'E2EB',
      config: {
        accountId: resp.accountId.toString(),
        privateKey: executorAccountKey.toStringDer(),
      },
      context: { accountId: resp.accountId.toString() } as any,
    });

    // Associate and grant KYC to executor (for cash in)
    await executorWrapper.associateToken({
      tokenId,
      accountId: resp.accountId.toString(),
      privateKey: executorAccountKey
    }).catch(() => {});
    await executorWrapper.waitForAssociation(resp.accountId.toString(), tokenId);
    await executorWrapper.grantKyc({
      targetId: resp.accountId.toString(),
      tokenId
    });
    await executorWrapper.waitForKyc(resp.accountId.toString(), tokenId);

    // Cash in tokens
    await executorWrapper.cashIn({
      tokenId,
      targetId: resp.accountId.toString(),
      amount: '750'
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

  it('should get the stablecoin balance of an account via agent', async () => {
    const input = `What is the balance of account ${executorClient.operatorAccountId!.toString()} for stablecoin ${tokenId}?`;

    const result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const lastMessage = result.messages[result.messages.length - 1].content;
    expect(lastMessage).toContain('750');
  }, 240000);
});
