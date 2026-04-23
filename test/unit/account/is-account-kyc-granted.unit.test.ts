import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => {
  return {
    Network: { init: vi.fn(), connect: vi.fn() },
    SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
    StableCoin: { isAccountKYCGranted: vi.fn() },
    KYCRequest: class { constructor(x: any) { Object.assign(this, x); } },
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
}));

vi.mock('@/shared/handle-transaction', () => ({
  handleTransaction: vi.fn(),
}));

import toolFactory, { IS_ACCOUNT_KYC_GRANTED_TOOL } from '@/tools/account/is-account-kyc-granted';

const makeClient = () => Client.forNetwork({});

describe('is-account-kyc-granted tool (unit)', () => {
  const config = { accountId: '0.0.1001', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(IS_ACCOUNT_KYC_GRANTED_TOOL);
    expect(tool.name).toBe('Is Account KYC Granted');
  });

  it('should check KYC status successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    (StableCoin.isAccountKYCGranted as any).mockResolvedValue(true);

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.raw.isKycGranted).toBe(true);
    expect(res.humanMessage).toContain('Account 0.0.6666 HAS KYC granted');
    expect(StableCoin.isAccountKYCGranted).toHaveBeenCalled();
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');

    (StableCoin.isAccountKYCGranted as any).mockRejectedValue(new Error('SDK Error'));

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to check KYC status: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });
});
