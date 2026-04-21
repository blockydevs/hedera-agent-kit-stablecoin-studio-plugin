import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => ({
  Network: { init: vi.fn(), connect: vi.fn() },
  ConnectRequest: vi.fn(),
  SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
  StableCoin: { unPause: vi.fn() },
  PauseRequest: vi.fn().mockImplementation(function (args) { Object.assign(this, args); }),
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

import toolFactory, { UNPAUSE_STABLECOIN_TOOL } from '@/tools/lifecycle/unpause-stablecoin';

const makeClient = () => Client.forNetwork({});

describe('unpause-stablecoin tool (unit)', () => {
  const config = { accountId: '0.0.1001', privateKey: '302e020100...' };
  const context: any = { mode: AgentMode.AUTONOMOUS };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct metadata', () => {
    const tool = toolFactory(context, config);
    expect(tool.method).toBe(UNPAUSE_STABLECOIN_TOOL);
    expect(tool.name).toBe('Unpause Stablecoin');
    expect(tool.description).toContain('unpause');
    expect(tool.parameters).toBeTruthy();
  });

  it('executes AUTONOMOUS happy path', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.unPause as any).mockResolvedValue({ status: 'SUCCESS' });

    const res: any = await tool.execute(client, context, { tokenId: '0.0.5555' });

    expect(res.raw).toEqual({ status: 'SUCCESS' });
    expect(res.humanMessage).toContain('unpaused successfully');
    expect(res.humanMessage).toContain('0.0.5555');
  });

  it('returns error when AUTONOMOUS mode without privateKey', async () => {
    const tool = toolFactory(context, { accountId: '0.0.1001' });
    const client = makeClient();

    const res: any = await tool.execute(client, context, { tokenId: '0.0.5555' });

    expect(res.humanMessage).toContain('Failed to unpause stablecoin');
    expect(res.humanMessage).toContain('privateKey is required');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });

  it('returns error response when SDK throws', async () => {
    const tool = toolFactory(context, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.unPause as any).mockRejectedValue(new Error('token not paused'));

    const res = await tool.execute(client, context, { tokenId: '0.0.5555' });
    expect(res.humanMessage).toContain('Failed to unpause stablecoin');
    expect(res.humanMessage).toContain('token not paused');
  });
});
