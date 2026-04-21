import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => ({
  Network: { init: vi.fn(), connect: vi.fn() },
  ConnectRequest: vi.fn(),
  SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
  StableCoin: { update: vi.fn() },
  UpdateRequest: vi.fn().mockImplementation(function (args) { Object.assign(this, args); }),
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
  return {
    ...original,
    initSdk: vi.fn(),
    connectSdk: vi.fn(),
    resolveNetwork: vi.fn(() => 'testnet'),
  };
});

import toolFactory, { UPDATE_STABLECOIN_TOOL } from '@/tools/lifecycle/update-stablecoin';

const makeClient = () => Client.forNetwork({});

describe('update-stablecoin tool (unit)', () => {
  const config = { accountId: '0.0.1001', privateKey: '302e020100300506032b657004220420...' };
  const context: any = { mode: AgentMode.AUTONOMOUS };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct metadata', () => {
    const tool = toolFactory(context, config);
    expect(tool.method).toBe(UPDATE_STABLECOIN_TOOL);
    expect(tool.name).toBe('Update Stablecoin');
    expect(typeof tool.description).toBe('string');
    expect(tool.description).toContain('stablecoin');
    expect(tool.parameters).toBeTruthy();
  });

  it('executes AUTONOMOUS happy path', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const fakeResponse = { status: 'SUCCESS' };
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.update as any).mockResolvedValue(fakeResponse);

    const params = { tokenId: '0.0.5555', name: 'Updated Coin' };
    const res: any = await tool.execute(client, context, params);

    expect(res.raw).toEqual(fakeResponse);
    expect(res.humanMessage).toContain('updated successfully');
    expect(res.humanMessage).toContain('0.0.5555');
  });

  it('works with partial updates (only some optional fields)', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.update as any).mockResolvedValue({ status: 'SUCCESS' });

    const params = { tokenId: '0.0.5555', memo: 'new memo' };
    const res: any = await tool.execute(client, context, params);

    expect(res.humanMessage).toContain('updated successfully');
  });

  it('returns error when AUTONOMOUS mode without privateKey', async () => {
    const noKeyConfig = { accountId: '0.0.1001' };
    const tool = toolFactory(context, noKeyConfig);
    const client = makeClient();

    const params = { tokenId: '0.0.5555', name: 'Updated' };
    const res: any = await tool.execute(client, context, params);

    expect(res.humanMessage).toContain('Failed to update stablecoin');
    expect(res.humanMessage).toContain('privateKey is required');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });

  it('returns error response when SDK throws', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.update as any).mockRejectedValue(new Error('not admin'));

    const params = { tokenId: '0.0.5555', name: 'Fail' };
    const res = await tool.execute(client, context, params);

    expect(res.humanMessage).toContain('Failed to update stablecoin');
    expect(res.humanMessage).toContain('not admin');
  });

  it('returns generic failure when a non-Error is thrown', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.update as any).mockRejectedValue('string error');

    const params = { tokenId: '0.0.5555', name: 'Fail' };
    const res = await tool.execute(client, context, params);

    expect(res.humanMessage).toBe('Failed to update stablecoin');
  });
});
