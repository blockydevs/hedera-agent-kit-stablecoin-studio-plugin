import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@hashgraph/sdk';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => ({
  Network: { init: vi.fn() },
  StableCoin: { getInfo: vi.fn() },
  GetStableCoinDetailsRequest: vi.fn(),
}));
vi.mock('@hashgraph/hedera-agent-kit', async importOriginal => {
  const original = await importOriginal<typeof import('@hashgraph/hedera-agent-kit')>();
  return {
    ...original,
    PromptGenerator: {
      getContextSnippet: vi.fn(() => 'CTX'),
      getParameterUsageInstructions: vi.fn(() => 'Usage: Provide the parameters as JSON.'),
    },
  };
});
vi.mock('@/stablecoin-sdk-utils', async importOriginal => {
  const original = await importOriginal<typeof import('@/stablecoin-sdk-utils')>();
  return { ...original, initSdk: vi.fn(), resolveNetwork: vi.fn(() => 'testnet') };
});

import toolFactory, { GET_STABLECOIN_INFO_TOOL } from '@/tools/lifecycle/get-stablecoin-info';

const makeClient = () => Client.forNetwork({});

describe('get-stablecoin-info tool (unit)', () => {
  const config = { accountId: '0.0.1001' };
  const context: any = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct metadata', () => {
    const tool = toolFactory(context, config);
    expect(tool.method).toBe(GET_STABLECOIN_INFO_TOOL);
    expect(tool.name).toBe('Get Stablecoin Info');
    expect(typeof tool.description).toBe('string');
    expect(tool.description).toContain('stablecoin');
    expect(tool.parameters).toBeTruthy();
  });

  it('executes happy path and returns formatted stablecoin details', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const fakeDetails = {
      tokenId: '0.0.1234567',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      totalSupply: '1000000000',
      maxSupply: '10000000000',
      treasury: '0.0.9999',
      proxyAddress: '0.0.8888',
      paused: false,
      deleted: false,
      freezeDefault: false,
      supplyType: 'FINITE',
      adminKey: '302a300506032b6570...',
      supplyKey: '302a300506032b6570...',
      wipeKey: null,
      kycKey: null,
      freezeKey: null,
      pauseKey: null,
      feeScheduleKey: null,
      memo: 'Test stablecoin',
      autoRenewAccount: '0.0.9999',
    };

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.getInfo as any).mockResolvedValue(fakeDetails);

    const params = { tokenId: '0.0.1234567' };
    const res: any = await tool.execute(client, context, params);

    expect(res).toBeDefined();
    expect(res.raw.tokenId).toBe(params.tokenId);
    expect(res.raw.details).toEqual(fakeDetails);
    expect(res.humanMessage).toContain('USD Coin');
    expect(res.humanMessage).toContain('USDC');
    expect(res.humanMessage).toContain('1000000000');
    expect(res.humanMessage).toContain('FINITE');
    expect(res.humanMessage).toContain('Wipe Key: Not Set');
    expect(res.humanMessage).toContain('Memo**: Test stablecoin');
  });

  it('returns error response when SDK throws an Error', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.getInfo as any).mockRejectedValue(new Error('token not found'));

    const res = await tool.execute(client, context, { tokenId: '0.0.9999' });
    expect(res.humanMessage).toContain('Failed to get stablecoin info');
    expect(res.humanMessage).toContain('token not found');
    expect(res.raw.error).toContain('Failed to get stablecoin info');
  });

  it('never includes confirmation instructions regardless of config', () => {
    const configs = [
      { accountId: '0.0.1001', requireConfirmation: 'always' as const },
      { accountId: '0.0.1001', requireConfirmation: 'auto' as const },
      { accountId: '0.0.1001', requireConfirmation: 'never' as const },
      { accountId: '0.0.1001' },
    ];
    for (const cfg of configs) {
      const tool = toolFactory(context, cfg);
      expect(tool.description).not.toContain('execution plan');
      expect(tool.description).not.toContain('approval');
      expect(tool.description).not.toContain('CRITICAL');
    }
  });

  it('returns generic failure when a non-Error is thrown', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.getInfo as any).mockRejectedValue('string error');

    const res = await tool.execute(client, context, { tokenId: '0.0.9999' });
    expect(res.humanMessage).toBe('Failed to get stablecoin info');
    expect(res.raw.error).toBe('Failed to get stablecoin info');
  });
});
