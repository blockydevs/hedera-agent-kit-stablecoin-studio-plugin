import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hashgraph/stablecoin-npm-sdk', () => ({
  Network: { init: vi.fn(), connect: vi.fn() },
  ConnectRequest: vi.fn(),
  SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
  StableCoin: { create: vi.fn() },
  CreateRequest: vi.fn(),
  TokenSupplyType: { FINITE: 'FINITE', INFINITE: 'INFINITE' },
  Account: { NullPublicKey: { key: '0'.repeat(64) } },
}));


vi.mock('@hashgraph/hedera-agent-kit', async importOriginal => {
  const original = await importOriginal<typeof import('@hashgraph/hedera-agent-kit')>();
  return {
    ...original,
    PromptGenerator: {
      getContextSnippet: vi.fn(() => 'CTX'),
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

import toolFactory, { CREATE_STABLECOIN_TOOL } from '@/tools/lifecycle/create-stablecoin';

const makeClient = () => Client.forNetwork({});

describe('create-stablecoin tool (unit)', () => {
  const config = { accountId: '0.0.1001', privateKey: '302e020100300506032b657004220420...' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS };
  const returnBytesContext: any = { mode: AgentMode.RETURN_BYTES };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(CREATE_STABLECOIN_TOOL);
    expect(tool.name).toBe('Create Stablecoin');
  });

  describe('should create a stablecoin with defaults', () => {
    it('should create a stablecoin with only a name and symbol', async () => {
      const tool = toolFactory(autonomousContext, config);
      const client = makeClient();

      const fakeResponse = { coin: { tokenId: '0.0.5555' }, proxyAddress: '0.0.5556' };
      const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
      (StableCoin.create as any).mockResolvedValue(fakeResponse);

      const params = { name: 'USD Coin', symbol: 'USDC', decimals: 6 };
      const res: any = await tool.execute(client, autonomousContext, params);

      expect(res.raw).toEqual(fakeResponse);
      expect(res.humanMessage).toContain('Stablecoin created successfully');
      expect(res.humanMessage).toContain('0.0.5555');
    });

    it('should initialize the SDK before creating', async () => {
      const tool = toolFactory(autonomousContext, config);
      const client = makeClient();

      const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
      (StableCoin.create as any).mockResolvedValue({ coin: { tokenId: '0.0.7777' } });

      const { initSdk, connectSdk, resolveNetwork } = await import('@/stablecoin-sdk-utils');

      await tool.execute(client, autonomousContext, { name: 'X', symbol: 'X', decimals: 6 });

      expect(resolveNetwork).toHaveBeenCalled();
      expect(initSdk).toHaveBeenCalled();
      expect(connectSdk).toHaveBeenCalled();
    });

    it('should default decimals to 6, initial supply to 0, reserve to false', () => {
      const tool = toolFactory(autonomousContext, config);
      const result = tool.parameters.parse({ name: 'Test', symbol: 'TST' });

      expect(result.decimals).toBe(6);
      expect(result.initialSupply).toBe('0');
      expect(result.createReserve).toBe(false);
    });

    it('should default supply type to infinite', async () => {
      const tool = toolFactory(autonomousContext, config);
      const { TokenSupplyType } = await import('@hashgraph/stablecoin-npm-sdk');
      const result = tool.parameters.parse({ name: 'Test', symbol: 'TST' });

      expect(result.supplyType).toBe(TokenSupplyType.INFINITE);
    });

    it('should default all role accounts to the operator account', () => {
      const tool = toolFactory(autonomousContext, config);
      const result = tool.parameters.parse({ name: 'Test', symbol: 'TST' });

      expect(result.proxyOwnerAccount).toBe('0.0.1001');
      expect(result.burnRoleAccount).toBe('0.0.1001');
      expect(result.wipeRoleAccount).toBe('0.0.1001');
      expect(result.rescueRoleAccount).toBe('0.0.1001');
      expect(result.pauseRoleAccount).toBe('0.0.1001');
      expect(result.freezeRoleAccount).toBe('0.0.1001');
      expect(result.deleteRoleAccount).toBe('0.0.1001');
      expect(result.kycRoleAccount).toBe('0.0.1001');
      expect(result.cashInRoleAccount).toBe('0.0.1001');
      expect(result.feeRoleAccount).toBe('0.0.1001');
    });

  });

  describe('should create a stablecoin with custom parameters', () => {
    it('should create a stablecoin with custom decimals', () => {
      const tool = toolFactory(autonomousContext, config);

      const zero = tool.parameters.parse({ name: 'Test', symbol: 'TST', decimals: 0 });
      expect(zero.decimals).toBe(0);

      const eighteen = tool.parameters.parse({ name: 'Test', symbol: 'TST', decimals: 18 });
      expect(eighteen.decimals).toBe(18);
    });

    it('should create a stablecoin with a finite supply and max supply', async () => {
      const tool = toolFactory(autonomousContext, config);
      const { TokenSupplyType } = await import('@hashgraph/stablecoin-npm-sdk');
      const result = tool.parameters.parse({
        name: 'Test',
        symbol: 'TST',
        supplyType: 'FINITE',
        maxSupply: '1000000',
      });

      expect(result.supplyType).toBe(TokenSupplyType.FINITE);
      expect(result.maxSupply).toBe('1000000');
    });

    it('should create a stablecoin with a custom burn role account', () => {
      const tool = toolFactory(autonomousContext, config);
      const result = tool.parameters.parse({
        name: 'Test',
        symbol: 'TST',
        burnRoleAccount: '0.0.9999',
      });

      expect(result.burnRoleAccount).toBe('0.0.9999');
      expect(result.pauseRoleAccount).toBe('0.0.1001');
    });

    it('should create a stablecoin with multiple custom role accounts', () => {
      const tool = toolFactory(autonomousContext, config);
      const result = tool.parameters.parse({
        name: 'Test',
        symbol: 'TST',
        burnRoleAccount: '0.0.9999',
        wipeRoleAccount: '0.0.8888',
      });

      expect(result.burnRoleAccount).toBe('0.0.9999');
      expect(result.wipeRoleAccount).toBe('0.0.8888');
      expect(result.pauseRoleAccount).toBe('0.0.1001');
    });
  });

  describe('should create a stablecoin in return-bytes mode', () => {
    it('should create without a private key', async () => {
      const noKeyConfig = { accountId: '0.0.1001' };
      const tool = toolFactory(returnBytesContext, noKeyConfig);
      const client = makeClient();

      const fakeResponse = { coin: { tokenId: '0.0.6666' } };
      const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
      (StableCoin.create as any).mockResolvedValue(fakeResponse);

      const params = { name: 'Test Coin', symbol: 'TST', decimals: 6 };
      const res: any = await tool.execute(client, returnBytesContext, params);

      expect(res.humanMessage).toContain('Stablecoin created successfully');
      expect(res.humanMessage).toContain('0.0.6666');
    });
  });

  describe('should reject invalid parameters', () => {
    it('should require name and symbol', () => {
      const tool = toolFactory(autonomousContext, config);

      expect(() => tool.parameters.parse({})).toThrow();
      expect(() => tool.parameters.parse({ name: 'Test' })).toThrow();
      expect(() => tool.parameters.parse({ symbol: 'TST' })).toThrow();
    });

    it('should reject decimals outside 0-18 range', () => {
      const tool = toolFactory(autonomousContext, config);

      expect(() => tool.parameters.parse({ name: 'Test', symbol: 'TST', decimals: -1 })).toThrow();
      expect(() => tool.parameters.parse({ name: 'Test', symbol: 'TST', decimals: 19 })).toThrow();
    });
  });

  describe('should handle creation failures', () => {
    it('should fail in autonomous mode without a private key', async () => {
      const noKeyConfig = { accountId: '0.0.1001' };
      const tool = toolFactory(autonomousContext, noKeyConfig);
      const client = makeClient();

      const params = { name: 'USD Coin', symbol: 'USDC', decimals: 6 };
      const res: any = await tool.execute(client, autonomousContext, params);

      expect(res.humanMessage).toContain('Failed to create stablecoin');
      expect(res.humanMessage).toContain('privateKey is required');
      expect(res.raw.status).toBe(Status.InvalidTransaction);
    });

    it('should fail when the SDK returns an empty response', async () => {
      const tool = toolFactory(autonomousContext, config);
      const client = makeClient();

      const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
      (StableCoin.create as any).mockResolvedValue(null);

      const params = { name: 'USD Coin', symbol: 'USDC', decimals: 6 };
      const res: any = await tool.execute(client, autonomousContext, params);

      expect(res.humanMessage).toContain('Failed to create stablecoin');
      expect(res.humanMessage).toContain('empty response');
      expect(res.raw.status).toBe(Status.InvalidTransaction);
    });

    it('should report unknown when the token ID is missing', async () => {
      const tool = toolFactory(autonomousContext, config);
      const client = makeClient();

      const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
      (StableCoin.create as any).mockResolvedValue({ coin: {} });

      const params = { name: 'USD Coin', symbol: 'USDC', decimals: 6 };
      const res: any = await tool.execute(client, autonomousContext, params);

      expect(res.humanMessage).toContain('Token ID: unknown');
    });

    it('should fail when the SDK throws an error', async () => {
      const tool = toolFactory(autonomousContext, config);
      const client = makeClient();

      const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
      (StableCoin.create as any).mockRejectedValue(new Error('insufficient balance'));

      const params = { name: 'USD Coin', symbol: 'USDC', decimals: 6 };
      const res = await tool.execute(client, autonomousContext, params);

      expect(res.humanMessage).toContain('Failed to create stablecoin');
      expect(res.humanMessage).toContain('insufficient balance');
      expect(res.raw.status).toBe(Status.InvalidTransaction);
    });

    it('should fail with a generic message for unexpected errors', async () => {
      const tool = toolFactory(autonomousContext, config);
      const client = makeClient();

      const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
      (StableCoin.create as any).mockRejectedValue('string error');

      const params = { name: 'USD Coin', symbol: 'USDC', decimals: 6 };
      const res = await tool.execute(client, autonomousContext, params);

      expect(res.humanMessage).toBe('Failed to create stablecoin');
    });
  });
});
