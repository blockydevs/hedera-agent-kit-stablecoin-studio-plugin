import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey, Transaction, AccountId } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
} from '../test-utils';
import associateTool from '@/tools/account/associate-stablecoin';
import getCapabilitiesTool from '@/tools/account/get-stablecoin-capabilities';
import getBalanceTool from '@/tools/account/get-stablecoin-balance';

describe('Account Return Bytes Mode Integration Tests', () => {
  let operatorClient: Client;
  let executorKey: PrivateKey;
  let executorAccountId: string;
  let operatorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    operatorClient = getOperatorClientForTests();
    operatorWrapper = new HederaOperationsWrapper(
      operatorClient,
      PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY! || '')
    );

    // Create executor account
    executorKey = PrivateKey.generateECDSA();
    executorAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Return Bytes Integration Tests',
      })
      .then((resp) => resp.accountId!.toString());

    await operatorWrapper.waitForAccount(executorAccountId);

    context = {
      mode: AgentMode.RETURN_BYTES,
      accountId: executorAccountId,
    };

    config = {
      accountId: executorAccountId,
      // NO private key in config
    };

    tokenId = await operatorWrapper.createStablecoin({
      name: `RB Account Test ${Date.now()}`,
      symbol: 'RBA',
      config: {
        accountId: operatorClient.operatorAccountId!.toString(),
        privateKey: process.env.PRIVATE_KEY!
      },
      context,
    });
  }, 120000);

  afterAll(async () => {
    if (operatorClient) {
      try {
        await operatorWrapper.deleteAccount({
          accountId: AccountId.fromString(executorAccountId),
          transferAccountId: operatorClient.operatorAccountId!,
        });
      } catch (error) {
        console.warn('Failed to clean up executor account:', error);
      }
      operatorClient.close();
    }
  });

  it('should return transaction bytes for association and allow external signing', async () => {
    const associate = associateTool(context, config);

    // 1. Get transaction from tool (RETURN_BYTES mode)
    const result = await associate.execute(operatorClient, context, {
      tokenId,
      // targetId should default to context.accountId
    });

    expect(result.raw).toBeDefined();
    expect(result.raw).toBeInstanceOf(Transaction);
    expect(result.humanMessage).toContain('Transaction ready for signing');

    const transaction = result.raw as Transaction;

    // 2. Externally sign and execute
    await transaction.sign(executorKey);
    const response = await transaction.execute(operatorClient);
    await response.getReceipt(operatorClient);

    // 3. Verify
    await operatorWrapper.waitForAssociation(executorAccountId, tokenId);
    const isAssociated = await operatorWrapper.isTokenAssociated(executorAccountId, tokenId);
    expect(isAssociated).toBe(true);
  });

  it('should allow querying capabilities in RETURN_BYTES mode (should not require signing)', async () => {
    const getCapabilities = getCapabilitiesTool(context, config);

    const result = await getCapabilities.execute(operatorClient, context, {
      tokenId,
      // targetId should default to context.accountId
    });

    expect(result.raw).toBeDefined();
    expect(result.humanMessage).toContain('Capabilities for');
  });

  it('should allow querying balance in RETURN_BYTES mode', async () => {
    const getBalance = getBalanceTool(context, config);

    const result = await getBalance.execute(operatorClient, context, {
      tokenId,
      // targetId should default to context.accountId
    });

    expect(result.raw).toBeDefined();
    expect(result.humanMessage).toContain('Balance of token');
  });
});
