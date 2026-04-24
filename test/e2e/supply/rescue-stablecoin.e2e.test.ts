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

describe('Rescue Stablecoin E2E Tests', () => {
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
            accountMemo: 'executor account for Rescue Stablecoin E2E Tests',
        });

        if (!resp.accountId) throw new Error('Failed to create executor account');
        await operatorWrapper.waitForAccount(resp.accountId.toString());

        executorClient = Client.forTestnet().setOperator(resp.accountId, executorAccountKey);
        executorWrapper = new HederaOperationsWrapper(executorClient, executorAccountKey);

        testSetup = await createLangchainTestSetup(executorClient, executorAccountKey.toStringRaw());

        tokenId = await executorWrapper.createStablecoin({
            name: `E2E Rescue ${Date.now()}`,
            symbol: 'E2ER',
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

        const info = await executorWrapper.getStablecoinInfo(tokenId);
        const treasuryId = info.treasury!.toString();
        const tokenAddress = info.proxyAddress?.toString() || info.evmProxyAddress?.toString() || '';

        // Grant KYC to executor
        await executorWrapper.grantKyc({
            targetId: resp.accountId.toString(),
            tokenId,
        });
        await executorWrapper.waitForKyc(resp.accountId.toString(), tokenId);
        await wait(20000);

        // Cash in tokens to treasury
        await executorWrapper.cashIn({
            tokenId,
            targetId: treasuryId,
            amount: '100'
        });
        await wait(10000);

        // Cash in tokens to executor
        await executorWrapper.cashIn({
            tokenId,
            targetId: resp.accountId.toString(),
            amount: '100'
        });
        await wait(10000);

        // Transfer from executor to token contract
        await executorWrapper.transfer({
            tokenId,
            targetId: tokenAddress,
            amount: '10',
            senderId: resp.accountId.toString()
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

    it('should rescue tokens from the contract via agent', async () => {
        const amountToRescue = '5';
        const input = `I want to rescue ${amountToRescue} tokens of the stablecoin ${tokenId} from the contract. Proceed immediately.`;

        let result = await testSetup.agent.invoke({
            messages: [{ role: 'user', content: input }],
        });

        const messages = result.messages;
        const toolCalled = messages.some((m: any) => m._getType() === 'tool');

        if (!toolCalled) {
            result = await testSetup.agent.invoke({
                messages: [
                    ...result.messages,
                    { role: 'user', content: 'yes, please rescue them' }
                ],
            });
        }

        await wait();

        const parsedResponse = testSetup.responseParser.parseNewToolMessages(result);
        expect(parsedResponse[0]).toBeDefined();
        const humanMessage = parsedResponse[0].parsedData.humanMessage.toLowerCase();
        expect(humanMessage).toContain('successfully');
        expect(humanMessage).toContain('rescued');

        // check treasury balance
        const info = await executorWrapper.getStablecoinInfo(tokenId);
        const treasuryId = info.treasury!.toString();
        const balance = await executorWrapper.getStablecoinBalance(treasuryId, tokenId);

        // Initial supply was 100 in treasury + 100 in executor. 
        // 10 was sent from executor to contract. 
        // 5 rescued from contract back to treasury.
        // Total in treasury should be 100 + 5 = 105.
        expect(balance.toString()).toBe('105');
    });
});
