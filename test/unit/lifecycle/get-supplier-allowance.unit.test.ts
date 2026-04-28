import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => {
  return {
    Network: { init: vi.fn(), connect: vi.fn() },
    SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
    Role: {
      getAllowance: vi.fn(),
      isUnlimited: vi.fn().mockResolvedValue(false),
    },
    GetSupplierAllowanceRequest: class { constructor(x: any) { Object.assign(this, x); } },
    CheckSupplierLimitRequest: class { constructor(x: any) { Object.assign(this, x); } },
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

import toolFactory, { GET_SUPPLIER_ALLOWANCE_TOOL } from '@/tools/lifecycle/get-supplier-allowance';

const makeClient = () => Client.forNetwork({});

describe('get-supplier-allowance tool (unit)', () => {
  const config = { accountId: '0.0.1001', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(GET_SUPPLIER_ALLOWANCE_TOOL);
    expect(tool.name).toBe('Get Supplier Allowance');
  });

  it('should get supplier allowance successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { Role } = await import('@hashgraph/stablecoin-npm-sdk');
    const fakeAllowance = {
      value: {
        toString: () => '100.5',
        toBigInt: () => BigInt(10050),
      },
    };
    (Role.getAllowance as any).mockResolvedValue(fakeAllowance);

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.raw.allowance).toBe('100.5');
    expect(res.humanMessage).toContain('Minting allowance of token 0.0.5555 for account 0.0.6666: 100.5');
    expect(Role.getAllowance).toHaveBeenCalled();
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { Role } = await import('@hashgraph/stablecoin-npm-sdk');

    (Role.getAllowance as any).mockRejectedValue(new Error('SDK Error'));

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to get supplier allowance: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });
});
