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

describe('Rescue HBAR Stablecoin E2E Tests', () => {
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
      accountMemo: 'executor account for Rescue HBAR E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');
    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

    tokenId = await executorWrapper.createStablecoin({
      name: `E2E Rescue HBAR ${Date.now()}`,
      symbol: 'E2ERH',
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

    // Send HBAR to the token contract address to be rescued
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const tokenAddress = info.proxyAddress?.toString() || info.evmProxyAddress?.toString() || '';

    // Transfer HBAR from executor to token contract
    await executorWrapper.transferHbar({
      to: tokenAddress,
      amount: 2 // 2 HBAR
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

  it('should rescue HBAR from the contract via agent', async () => {
    const amountToRescue = '1';
    const input = `I want to rescue ${amountToRescue} HBAR from the stablecoin ${tokenId} contract. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes, please rescue the HBAR' }
        ],
      });
    }

    await wait();

    const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
    expect(parsedResponse[0]).toBeDefined();
    const humanMessage = parsedResponse[0].parsedData.humanMessage.toLowerCase();
    expect(humanMessage).toContain('successfully');
    expect(humanMessage).toContain('rescued');
    expect(humanMessage).toContain('hbar');

    // Check treasury balance
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();
    const finalBalance = await executorWrapper.getAccountBalances(treasuryId);

    // We can't easily know the exact starting balance because of fees, 
    // but it should be greater than 0 since we rescued 1 HBAR.
    expect(Number(finalBalance)).toBeGreaterThan(0);
  });
});
