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
} from '../../integration/test-utils';

function extractTokenId(testSetup: any, result: any) {
  const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
  if (parsedResponse.length === 0) {
    throw new Error('No tool messages found in agent result');
  }

  const rawTokenId = parsedResponse[0].parsedData.raw.tokenId;
  if (!rawTokenId) {
    throw new Error('No tokenId found in agent result tool messages');
  }

  // Handle both string and object format from SDK/Mirror Node
  if (typeof rawTokenId === 'string') {
    return rawTokenId;
  }

  if (rawTokenId.num !== undefined) {
    const shard = rawTokenId.shard?.low ?? rawTokenId.shard ?? 0;
    const realm = rawTokenId.realm?.low ?? rawTokenId.realm ?? 0;
    const num = rawTokenId.num?.low ?? rawTokenId.num;
    return `${shard}.${realm}.${num}`;
  }

  return rawTokenId.toString();
}

describe('Create Stablecoin E2E Tests', () => {
  let testSetup: LangchainTestSetup;
  let executorClient: Client;
  let operatorClient: Client;
  let executorWrapper: HederaOperationsWrapper;
  let burnerKey: PrivateKey;
  let burnerId: string;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    // Setup initial client
    const baseSetup = await createLangchainTestSetup();
    operatorClient = baseSetup.client;
    const operatorWrapper = new HederaOperationsWrapper(operatorClient);

    const executorAccountKey = PrivateKey.generateECDSA();
    const resp = await operatorWrapper.createAccount({
      key: executorAccountKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MAXIMUM),
      accountMemo: 'executor account for Create Stablecoin E2E Tests',
    });

    if (!resp.accountId) throw new Error('Failed to create executor account');

    await operatorWrapper.waitForAccount(resp.accountId.toString());

    executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);

    testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());
    executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);
  }, 120000);

  afterAll(async () => {
    if (executorClient && operatorClient) {
      try {
        // Clean up burner account if it exists
        if (burnerId && burnerKey) {
          const burnerClient = Client.forTestnet().setOperator(burnerId, burnerKey);
          const burnerWrapper = new HederaOperationsWrapper(burnerClient, burnerKey);
          await burnerWrapper.teardownAccount({
            accountId: burnerId,
            transferAccountId: operatorClient.operatorAccountId!.toString(),
          });
          burnerClient.close();
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

  it('should create a new stablecoin with name and symbol', async () => {
    const tokenName = `E2E_Token_${Date.now()}`;
    const tokenSymbol = `E2ET`;
    const input = `Create a new stablecoin named "${tokenName}" with symbol "${tokenSymbol}". Confirm when ready.`;

    // 1. Initial request to get the plan
    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    // 2. Confirm the plan
    result = await testSetup.agent.invoke({
      messages: [
        ...result.messages,
        { role: 'user', content: 'yes, proceed' }
      ],
    });

    const tokenId = extractTokenId(testSetup, result);

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    expect(info.name).toBe(tokenName);
    expect(info.symbol).toBe(tokenSymbol);
    expect(info.decimals).toBe(6); // Default
  }, 240000);

  it('should create a stablecoin with custom decimals and initial supply', async () => {
    const tokenName = `E2E_Supply_${Date.now()}`;
    const tokenSymbol = `E2ES`;
    const input = `Create a stablecoin named "${tokenName}" (${tokenSymbol}) with 8 decimals and initial supply of 1000. Proceed immediately.`;

    // The agent might ask for confirmation or just do it if told to "proceed immediately"
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
          { role: 'user', content: 'yes' }
        ],
      });
    }

    const tokenId = extractTokenId(testSetup, result);

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    expect(info.name).toBe(tokenName);
    expect(info.decimals).toBe(8);
    // totalSupply is returned in display units so the same as input of the tool call
    expect(info.totalSupply?.toString()).toBe('1000');
  }, 240000);

  it('should create a finite supply stablecoin with max supply', async () => {
    const tokenName = `E2E_Finite_${Date.now()}`;
    const tokenSymbol = `E2EF`;
    const input = `Create a finite supply stablecoin named "${tokenName}" (${tokenSymbol}) with initial supply 100 and max supply 1000. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes' }
        ],
      });
    }

    const tokenId = extractTokenId(testSetup, result);

    const info = await executorWrapper.getStablecoinInfo(tokenId);
    expect(info.name).toBe(tokenName);
    expect(info.maxSupply?.toString()).toBe('1000');
    expect(info.totalSupply?.toString()).toBe('100');
  }, 240000);

  it('should create a stablecoin with custom burn role account', async () => {
    // Create another account to be the burner
    burnerKey = PrivateKey.generateECDSA();
    const burnerAccount = await executorWrapper.createAccount({
      key: burnerKey.publicKey,
      initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
      accountMemo: 'burner account for E2E Test',
    });
    burnerId = burnerAccount.accountId!.toString();

    const tokenName = `E2E_Role_${Date.now()}`;
    const tokenSymbol = `E2ER`;
    const input = `Create a stablecoin named "${tokenName}" (${tokenSymbol}) and set the burn role to account ${burnerId}. Proceed immediately.`;

    let result = await testSetup.agent.invoke({
      messages: [{ role: 'user', content: input }],
    });

    const messages = result.messages;
    const toolCalled = messages.some((m: any) => m._getType() === 'tool');

    if (!toolCalled) {
      result = await testSetup.agent.invoke({
        messages: [
          ...result.messages,
          { role: 'user', content: 'yes' }
        ],
      });
    }

    const tokenId = extractTokenId(testSetup, result);

    // Verify capabilities of the burner account
    const capabilities = await executorWrapper.getCapabilities(burnerId, tokenId);
    const hasBurnRole = capabilities.capabilities.some(c => c.operation === 'Burn');
    expect(hasBurnRole).toBe(true);
  }, 240000);
});
