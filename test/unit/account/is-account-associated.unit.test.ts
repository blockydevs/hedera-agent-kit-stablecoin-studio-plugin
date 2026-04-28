import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => {
  return {
    Network: { init: vi.fn(), connect: vi.fn() },
    SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
    StableCoin: { isAccountAssociated: vi.fn() },
    IsAccountAssociatedTokenRequest: class { constructor(x: any) { Object.assign(this, x); } },
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

vi.mock('@/stablecoin-sdk-utils', () => ({
  initSdk: vi.fn(),
  connectSdk: vi.fn(),
  resolveNetwork: vi.fn(() => 'testnet'),
  ensureSdkConnected: vi.fn(),
  extractStatus: vi.fn(() => Status.InvalidTransaction),
}));

vi.mock('@/shared/handle-transaction', () => ({
  handleTransaction: vi.fn(),
}));

import toolFactory, { IS_ACCOUNT_ASSOCIATED_TOOL } from '@/tools/account/is-account-associated';

const makeClient = () => Client.forNetwork({});

describe('is-account-associated tool (unit)', () => {
  const config = { accountId: '0.0.1001', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(IS_ACCOUNT_ASSOCIATED_TOOL);
    expect(tool.name).toBe('Is Account Associated');
  });

  it('should check association successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.isAccountAssociated as any).mockResolvedValue(true);

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.raw.isAssociated).toBe(true);
    expect(res.humanMessage).toContain('Account 0.0.6666 is associated');
    expect(StableCoin.isAccountAssociated).toHaveBeenCalled();
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');

    (StableCoin.isAccountAssociated as any).mockRejectedValue(new Error('SDK Error'));

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to check stablecoin association: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });
});
