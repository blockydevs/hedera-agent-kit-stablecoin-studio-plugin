import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Status } from '@hiero-ledger/sdk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';

vi.mock('@hiero-ledger/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@hiero-ledger/sdk')>();
  return {
    ...original,
    Transaction: {
      ...original.Transaction,
      fromBytes: vi.fn(() => ({
        sign: vi.fn().mockReturnThis(),
        execute: vi.fn(),
      })),
    },
  };
});

vi.mock('@hashgraph/stablecoin-npm-sdk', () => {
  return {
    Network: { init: vi.fn(), connect: vi.fn() },
    SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
    StableCoin: { buildBurn: vi.fn() },
    BurnRequest: class { constructor(x: any) { Object.assign(this, x); } },
    ConnectRequest: class { constructor(x: any) { Object.assign(this, x); } },
    InitializationRequest: class { constructor(x: any) { Object.assign(this, x); } },
  };
});

vi.mock('@hashgraph/hedera-agent-kit', async importOriginal => {const original = await importOriginal<typeof import('@hashgraph/hedera-agent-kit')>();
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
    
  };});

vi.mock('@/stablecoin-sdk-utils', () => ({
  initSdk: vi.fn(),
  connectSdk: vi.fn(),
  resolveNetwork: vi.fn(() => 'testnet'),
  ensureSdkConnected: vi.fn(),
  hexToUint8Array: vi.fn(hex => Buffer.from(hex, 'hex')),
}));

vi.mock('@/shared/handle-transaction', () => ({
  handleTransaction: vi.fn(),
}));

import toolFactory, { BURN_STABLECOIN_TOOL } from '@/tools/supply/burn-stablecoin';

const makeClient = () => Client.forNetwork({});

describe('burn-stablecoin tool (unit)', () => {
  const config = { accountId: '0.0.1001', privateKey: '302e020100300506032b657004220420...', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };
  const returnBytesContext: any = { mode: AgentMode.RETURN_BYTES, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(BURN_STABLECOIN_TOOL);
    expect(tool.name).toBe('Burn Stablecoin');
  });

  it('should burn tokens successfully in autonomous mode', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildBurn as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });
    
    const fakeResponse = {
      raw: { transactionId: '0.0.1001@123.456', status: Status.Success },
      humanMessage: 'Successfully burned tokens for stablecoin.',
    };
    (handleTransaction as any).mockResolvedValue(fakeResponse);

    const params = { tokenId: '0.0.5555', amount: '100' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res).toEqual(fakeResponse);
    expect(StableCoin.buildBurn).toHaveBeenCalled();
  });

  it('should return transaction in return-bytes mode', async () => {
    const tool = toolFactory(returnBytesContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildBurn as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });

    const fakeReturnBytesResponse = { bytes: new Uint8Array([1, 2, 3]) };
    (handleTransaction as any).mockResolvedValueOnce(fakeReturnBytesResponse);

    const params = { tokenId: '0.0.5555', amount: '100' };
    const res: any = await tool.execute(client, returnBytesContext, params);

    expect(res).toEqual(fakeReturnBytesResponse);
  });

  it('should handle missing privateKey in autonomous mode', async () => {
    const tool = toolFactory(autonomousContext, { ...config, privateKey: undefined } as any);
    const client = makeClient();
    const params = { tokenId: '0.0.5555', amount: '100' };

    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('privateKey is required');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');

    (StableCoin.buildBurn as any).mockRejectedValue(new Error('SDK Error'));

    const params = { tokenId: '0.0.5555', amount: '100' };
    const res = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to burn stablecoin: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });
});
