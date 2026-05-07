import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => {
  class MockRequest { constructor(x: any) { Object.assign(this, x); } }
  return {
    Network: { init: vi.fn(), connect: vi.fn() },
    SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
    StableCoin: { getBalanceOf: vi.fn() },
    GetAccountBalanceRequest: MockRequest,
    ConnectRequest: MockRequest,
    InitializationRequest: MockRequest,
  };
});

vi.mock('@hashgraph/hedera-agent-kit', async importOriginal => {
  const original = await importOriginal<typeof import('@hashgraph/hedera-agent-kit')>();
  return {
    ...original,
    AgentMode: {
        AUTONOMOUS: 'autonomous',
        RETURN_BYTES: 'returnBytes',
    },
    PromptGenerator: {
      getContextSnippet: vi.fn(() => 'CTX'),
      getParameterUsageInstructions: vi.fn(() => 'USAGE'),
    },
  };
});

vi.mock('@/shared/utils/stablecoin-sdk-utils', () => ({
  initSdk: vi.fn(),
  connectSdk: vi.fn(),
  resolveNetwork: vi.fn(() => 'testnet'),
  ensureSdkConnected: vi.fn(),
  extractStatus: vi.fn(() => Status.InvalidTransaction),
}));

vi.mock('@/shared/utils/handle-transaction', () => ({
  handleTransaction: vi.fn(),
}));

import toolFactory, { GET_STABLECOIN_BALANCE_TOOL } from '@/tools/account/get-stablecoin-balance';

const makeClient = () => Client.forNetwork({});

describe('get-stablecoin-balance tool (unit)', () => {
  const config = { accountId: '0.0.1001', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(GET_STABLECOIN_BALANCE_TOOL);
    expect(tool.name).toBe('Get Stablecoin Balance');
  });

  it('should get balance successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const fakeBalance = {
      value: {
        toString: () => '100.5',
        toBigInt: () => BigInt(100500000),
      },
    };
    (StableCoin.getBalanceOf as any).mockResolvedValue(fakeBalance);

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.raw.balance).toBe('100.5');
    expect(res.humanMessage).toContain('Balance of token 0.0.5555 for account 0.0.6666: 100.5');
    expect(StableCoin.getBalanceOf).toHaveBeenCalled();
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.getBalanceOf as any).mockRejectedValue(new Error('SDK Error'));

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to get stablecoin balance: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });
});
