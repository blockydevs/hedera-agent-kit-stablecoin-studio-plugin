import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AccountId, Client, PrivateKey, Transaction } from '@hiero-ledger/sdk';
import { AgentMode, type Context } from '@hashgraph/hedera-agent-kit';
import {
  getOperatorClientForTests,
  getCustomClient,
  HederaOperationsWrapper,
  UsdToHbarService,
  BALANCE_TIERS,
  wait,
} from '../test-utils';
import createHoldTool from '@/tools/supply/create-hold';
import executeHoldTool from '@/tools/supply/execute-hold';
import { extractHoldIdFromRecord } from '@/shared/utils/token-utils';

describe('Supply Hold Return Bytes Mode Integration Tests', () => {
  let fundingClient: Client;
  let fundingKey: PrivateKey;
  let operatorNonKeyClient: Client;
  let executorKey: PrivateKey;
  let executorAccountId: string;
  let targetAccountId: string;
  let targetKey: PrivateKey;
  let fundingWrapper: HederaOperationsWrapper;
  let executorWrapper: HederaOperationsWrapper;
  let context: Context;
  let tokenId: string;
  let config: any;

  beforeAll(async () => {
    await UsdToHbarService.initialize();
    fundingKey = PrivateKey.fromString(process.env.PRIVATE_KEY! || '');
    operatorNonKeyClient = Client.forTestnet();
    fundingClient = getOperatorClientForTests();
    fundingWrapper = new HederaOperationsWrapper(fundingClient, fundingKey);

    // Create executor account
    executorKey = PrivateKey.generateECDSA();
    executorAccountId = await fundingWrapper
      .createAccount({
        key: executorKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.ELEVATED),
        accountMemo: 'executor account for Supply Hold RB Tests',
      })
      .then(resp => resp.accountId!.toString());

    await fundingWrapper.waitForAccount(executorAccountId);

    executorWrapper = new HederaOperationsWrapper(
      getCustomClient(AccountId.fromString(executorAccountId), executorKey),
      executorKey,
    );

    // Create target account
    targetKey = PrivateKey.generateECDSA();
    targetAccountId = await fundingWrapper
      .createAccount({
        key: targetKey.publicKey,
        initialBalance: UsdToHbarService.usdToHbar(BALANCE_TIERS.MINIMAL),
        accountMemo: 'target account for Supply Hold RB Tests',
      })
      .then(resp => resp.accountId!.toString());
    
    await fundingWrapper.waitForAccount(targetAccountId);

    context = {
      mode: AgentMode.RETURN_BYTES,
      accountId: executorAccountId,
      accountPublicKey: executorKey.publicKey.toStringDer(),
    };

    config = {
      accountId: executorAccountId,
    };

    // Create stablecoin
    tokenId = await executorWrapper.createStablecoin({
      name: `RB Hold Test ${Date.now()}`,
      symbol: 'RBH',
      config: {
        accountId: executorAccountId,
        privateKey: executorKey.toStringDer(),
      },
      context,
    });

    await executorWrapper.associateToken({
      accountId: executorAccountId,
      tokenId,
      privateKey: executorKey,
    });
    await executorWrapper.waitForAssociation(executorAccountId, tokenId);

    await executorWrapper.grantKyc({
      targetId: executorAccountId,
      tokenId,
    });
    await executorWrapper.waitForKyc(executorAccountId, tokenId);

    // Associate and grant KYC to target
    await fundingWrapper.associateToken({ accountId: targetAccountId, tokenId, privateKey: targetKey });
    await fundingWrapper.waitForAssociation(targetAccountId, tokenId);
    await executorWrapper.grantKyc({ targetId: targetAccountId, tokenId });
    await executorWrapper.waitForKyc(targetAccountId, tokenId);

    // Cash in some tokens to hold
    await executorWrapper.cashIn({
        tokenId,
        targetId: executorAccountId,
        amount: '100'
    });
    
    await wait(10000);
  });

  afterAll(async () => {
    if (fundingClient) {
      try {
        if (executorAccountId) {
          await executorWrapper.deleteAccount({
            accountId: AccountId.fromString(executorAccountId),
            transferAccountId: fundingClient.operatorAccountId!,
          });
        }
        if (targetAccountId) {
            await fundingWrapper.deleteAccount({
                accountId: AccountId.fromString(targetAccountId),
                transferAccountId: fundingClient.operatorAccountId!,
            });
        }
      } catch (error) {
        console.warn('Failed to clean up accounts:', error);
      }
      fundingClient.close();
    }
  });

  it('should return transaction bytes for create/execute hold and allow external signing', async () => {
    // 1. Create hold
    const createHold = createHoldTool(context, config);
    const expirationDate = Math.floor(Date.now() / 1000) + 3600;

    const result: any = await createHold.execute(operatorNonKeyClient, context, {
      tokenId,
      amount: '10',
      escrow: executorAccountId,
      expirationDate: expirationDate.toString(),
      accountId: targetAccountId, // Use 'accountId' as per tool parameters
    });

    expect(result.raw.bytes).toBeDefined();
    const transaction = Transaction.fromBytes(result.raw.bytes);
    await transaction.sign(executorKey);
    const response = await transaction.execute(fundingClient);
    const record = await response.getRecord(fundingClient);

    // Extract holdId manually from record
    const bytes = record.contractFunctionResult?.bytes;
    console.log('DEBUG createHold bytes length:', bytes?.length);
    console.log('DEBUG createHold bytes hex:', bytes ? Buffer.from(bytes).toString('hex') : 'null');
    
    // Solidity returns (bool, uint256) for createHold? 
    // Or just uint256? 
    // If it's just uint256, it's bytes 0-31.
    const holdId = extractHoldIdFromRecord(record);
    console.log('DEBUG extracted holdId:', holdId);

    expect(holdId).toBeDefined();
    await wait(10000);

    // 2. Execute hold
    const executeHold = executeHoldTool(context, config);
    const execResult: any = await executeHold.execute(operatorNonKeyClient, context, {
      tokenId,
      holdId: Number(holdId),
      amount: '10',
      sourceId: executorAccountId,
      targetId: targetAccountId,
    });

    if (!execResult.raw.bytes) {
        throw new Error(`Execute hold failed: ${execResult.humanMessage}`);
    }

    expect(execResult.raw.bytes).toBeDefined();
    const execTx = Transaction.fromBytes(execResult.raw.bytes);
    await execTx.sign(executorKey);
    const execResponse = await execTx.execute(fundingClient);
    await execResponse.getReceipt(fundingClient);

    await wait(5000);

    // Verify balances after execution
    const balanceTarget = await executorWrapper.getStablecoinBalance(targetAccountId, tokenId);
    expect(balanceTarget).toBe('10');
    
    const balanceSource = await executorWrapper.getStablecoinBalance(executorAccountId, tokenId);
    expect(balanceSource).toBe('90'); // 100 - 10
  });
});
