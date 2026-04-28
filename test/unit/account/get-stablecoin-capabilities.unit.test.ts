import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => {
  return {
    Network: { init: vi.fn(), connect: vi.fn() },
    SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
    StableCoin: { capabilities: vi.fn() },
    Role: { hasRole: vi.fn() },
    StableCoinRole: {
      CASHIN_ROLE: 'CASHIN_ROLE',
      BURN_ROLE: 'BURN_ROLE',
      WIPE_ROLE: 'WIPE_ROLE',
      FREEZE_ROLE: 'FREEZE_ROLE',
      PAUSE_ROLE: 'PAUSE_ROLE',
      RESCUE_ROLE: 'RESCUE_ROLE',
      DELETE_ROLE: 'DELETE_ROLE',
      DEFAULT_ADMIN_ROLE: 'DEFAULT_ADMIN_ROLE',
      KYC_ROLE: 'KYC_ROLE',
      CUSTOM_FEES_ROLE: 'CUSTOM_FEES_ROLE',
      HOLD_CREATOR_ROLE: 'HOLD_CREATOR_ROLE',
    },
    Operation: {
      BURN: 'Burn',
      CASH_IN: 'Cash_in',
      WIPE: 'Wipe',
      FREEZE: 'Freeze',
      UNFREEZE: 'Unfreeze',
      PAUSE: 'Pause',
      UNPAUSE: 'Unpause',
      DELETE: 'Delete',
      RESCUE: 'Rescue',
      ROLE_MANAGEMENT: 'Role_Management',
      GRANT_KYC: 'Grant_KYC',
      REVOKE_KYC: 'Revoke_KYC',
      CREATE_CUSTOM_FEE: 'Create_Custom_Fee',
      REMOVE_CUSTOM_FEE: 'Remove_Custom_Fee',
    },
    Access: {
      0: 'HTS',
      1: 'CONTRACT',
      HTS: 0,
      CONTRACT: 1,
    },
    CapabilitiesRequest: class {
      constructor(x: any) {
        Object.assign(this, x);
      }
    },
    HasRoleRequest: class {
      constructor(x: any) {
        Object.assign(this, x);
      }
    },
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

import toolFactory, { GET_STABLECOIN_CAPABILITIES_TOOL } from '@/tools/account/get-stablecoin-capabilities';

const makeClient = () => Client.forNetwork({});

describe('get-stablecoin-capabilities tool (unit)', () => {
  const config = { accountId: '0.0.1001', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(GET_STABLECOIN_CAPABILITIES_TOOL);
    expect(tool.name).toBe('Get Stablecoin Capabilities');
  });

  it('should get capabilities successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const fakeCapabilities = {
      capabilities: [{ operation: 'Burn', access: 0 }],
      coin: { tokenId: '0.0.5555' },
      account: { id: '0.0.6666' },
    };
    (StableCoin.capabilities as any).mockResolvedValue(fakeCapabilities);

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.raw.grantedOperations).toContain('Burn');
    expect(res.humanMessage).toContain('Capabilities for account 0.0.6666 for stablecoin 0.0.5555: Burn');
    expect(StableCoin.capabilities).toHaveBeenCalled();
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');

    (StableCoin.capabilities as any).mockRejectedValue(new Error('SDK Error'));

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to get stablecoin capabilities: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });

  it('should filter CONTRACT capabilities based on Role.hasRole', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin, Role } = await import('@hashgraph/stablecoin-npm-sdk');
    const fakeCapabilities = {
      capabilities: [
        { operation: 'Burn', access: 0 }, // HTS
        { operation: 'Cash_in', access: 1 }, // CONTRACT
        { operation: 'Wipe', access: 1 }, // CONTRACT
      ],
      coin: { tokenId: '0.0.5555' },
      account: { id: '0.0.6666' },
    };
    (StableCoin.capabilities as any).mockResolvedValue(fakeCapabilities);
    
    // Mock Role.hasRole: Cash_in returns true, Wipe returns false
    (Role.hasRole as any).mockImplementation(async (req: any) => {
      if (req.role === 'CASHIN_ROLE') return true;
      if (req.role === 'WIPE_ROLE') return false;
      return false;
    });

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.raw.grantedOperations).toContain('Burn');
    expect(res.raw.grantedOperations).toContain('Cash_in');
    expect(res.raw.grantedOperations).not.toContain('Wipe');
    expect(res.humanMessage).toContain('Burn, Cash_in');
    expect(res.humanMessage).not.toContain('Wipe');
    expect(Role.hasRole).toHaveBeenCalledTimes(2);
  });
});
