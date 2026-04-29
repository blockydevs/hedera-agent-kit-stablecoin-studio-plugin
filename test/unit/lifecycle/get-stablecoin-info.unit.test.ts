import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => {
  return {
    Network: { init: vi.fn(), connect: vi.fn() },
    SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
    StableCoin: { getInfo: vi.fn() },
    GetStableCoinDetailsRequest: class { constructor(x: any) { Object.assign(this, x); } },
    ConnectRequest: class { constructor(x: any) { Object.assign(this, x); } },
    InitializationRequest: class { constructor(x: any) { Object.assign(this, x); } },
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

import toolFactory, { GET_STABLECOIN_INFO_TOOL } from '@/tools/lifecycle/get-stablecoin-info';

const makeClient = () => Client.forNetwork({});

describe('get-stablecoin-info tool (unit)', () => {
  const config = { accountId: '0.0.1001', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(GET_STABLECOIN_INFO_TOOL);
    expect(tool.name).toBe('Get Stablecoin Info');
  });

  it('should get stablecoin info successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const fakeInfo = {
      tokenId: '0.0.5555',
      name: 'Test Token',
      symbol: 'TEST',
      decimals: 2,
      totalSupply: '1000000',
      maxSupply: '2000000',
      treasury: '0.0.1001',
      proxyAddress: '0.0.2001',
      supplyType: 'INFINITE',
      paused: false,
      deleted: false,
    };
    (StableCoin.getInfo as any).mockResolvedValue(fakeInfo);

    const params = { tokenId: '0.0.5555' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.raw.details).toEqual(fakeInfo);
    expect(res.humanMessage).toContain('Stablecoin Details for **0.0.5555**');
    expect(res.humanMessage).toContain('#### Proof of Reserve');
    expect(res.humanMessage).toContain('_Not enabled for this stablecoin_');
    expect(StableCoin.getInfo).toHaveBeenCalled();
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');

    (StableCoin.getInfo as any).mockRejectedValue(new Error('SDK Error'));

    const params = { tokenId: '0.0.5555' };
    const res = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to get stablecoin info: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });
});
