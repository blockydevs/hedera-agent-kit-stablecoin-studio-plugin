import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  getCustomClient,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import rescueStablecoinTool from '@/tools/supply/rescue-stablecoin';



describe('Rescue Operations Integration Tests', () => {
  let operatorClient: Client;
  let executorClient: Client;
  let operatorWrapper: HederaOperationsWrapper;
  let executorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    operatorClient = getOperatorClientForTests();
    operatorWrapper = new HederaOperationsWrapper(
      operatorClient,
      PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY || '')
    );

    // Create executor account
    const executorKey = PrivateKey.generateECDSA();
    const executorAccountId = await operatorWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Rescue Operations Integration Tests',
      })
      .then((resp) => resp.accountId!);

    await operatorWrapper.waitForAccount(executorAccountId.toString());

    executorClient = getCustomClient(executorAccountId, executorKey);
    executorWrapper = new HederaOperationsWrapper(
      executorClient,
      PrivateKey.fromStringECDSA(executorKey.toString())
    );

    context = {
      mode: AgentMode.AUTONOMOUS,
      accountId: executorAccountId.toString(),
    };

    config = {
      accountId: executorAccountId.toString(),
      privateKey: executorKey.toStringDer(),
    };

    tokenId = await executorWrapper.createStablecoin({
      name: `Rescue Test ${Date.now()}`,
      symbol: 'RSC',
      config,
      context,
    });

    // 2. Associate the executor account
    await executorWrapper.associateToken({
      tokenId,
      accountId: context.accountId!,
    });

    // 3. Wait for association and grant KYC
    await executorWrapper.waitForAssociation(context.accountId!, tokenId);
    await executorWrapper.grantKyc({
      accountId: context.accountId!,
      tokenId,
    });
    await executorWrapper.waitForKyc(context.accountId!, tokenId);

    // 4. Fund treasury with HBAR for rescue HBAR test
    // We need to know the treasury account ID.
    const info = await executorWrapper.getStablecoinInfo(tokenId);
    const treasuryId = info.treasury!.toString();

    // Send 5 HBAR from operator to treasury to ensure it has balance to rescue
    await operatorWrapper.transferHbar({
      to: treasuryId,
      amount: 5,
    });

    // 5. Send tokens to the token contract for rescue tokens test
    // To rescue tokens, they must be in the token contract address.
    // First mint some tokens to executor.
    await executorWrapper.cashIn({
      tokenId,
      targetId: context.accountId!,
      amount: '100',
    });
    await wait();

    await executorWrapper.transfer({
      tokenId,
      targetId: treasuryId,
      amount: '60',
      senderId: context.accountId!,
    });

    const tokenAddress = info.proxyAddress?.toString() || info.evmProxyAddress?.toString() || '';
    await executorWrapper.transfer({
      tokenId,
      targetId: tokenAddress,
      amount: '10',
      senderId: context.accountId!,
    });

    await wait();
  }, 120000);

  afterAll(async () => {
    if (executorClient && operatorClient) {
      try {
        await executorWrapper.deleteAccount({
          accountId: executorClient.operatorAccountId!,
          transferAccountId: operatorClient.operatorAccountId!,
        });
      } catch (error) {
        console.warn('Failed to clean up executor account:', error);
      }
      executorClient.close();
    }
    if (operatorClient) {
      operatorClient.close();
    }
  });

  it('should rescue tokens', async () => {
    const tool = rescueStablecoinTool(context, config);

    // Rescuing tokens should execute successfully as a transaction
    const result: any = await tool.execute(executorClient, context, {
      tokenId,
      amount: '1',
    });
    expect(result.humanMessage).toContain('Successfully rescued');
  });
});
