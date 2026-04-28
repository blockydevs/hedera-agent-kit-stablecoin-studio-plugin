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
    Account: { NullPublicKey: { key: 'null', type: 'null' } },
    PublicKey: class {
      constructor(x: any) {
        if (typeof x === 'string') {
          (this as any).key = x;
          (this as any).type = 'ED25519';
        } else {
          Object.assign(this, x);
        }
      }
      static NULL = { key: 'null', type: 'null' };
    },
    SupportedWallets: { CLIENT: 'CLIENT', EXTERNAL_HEDERA: 'EXTERNAL_HEDERA' },
    StableCoin: { buildUpdate: vi.fn() },
    UpdateRequest: class { constructor(x: any) { Object.assign(this, x); } },
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
  parsePublicKey: vi.fn(key => ({ key, type: 'ED25519' })),
  extractStatus: vi.fn(() => Status.InvalidTransaction),
}));

vi.mock('@/shared/handle-transaction', () => ({
  handleTransaction: vi.fn(),
}));

import toolFactory, { UPDATE_STABLECOIN_TOOL } from '@/tools/lifecycle/update-stablecoin';

const makeClient = () => Client.forNetwork({});

describe('update-stablecoin tool (unit)', () => {
  const config = { accountId: '0.0.1001', privateKey: '302e020100300506032b657004220420...', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };
  const returnBytesContext: any = { mode: AgentMode.RETURN_BYTES, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(UPDATE_STABLECOIN_TOOL);
    expect(tool.name).toBe('Update Stablecoin');
  });

  it('should update stablecoin successfully in autonomous mode', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildUpdate as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });
    
    const fakeResponse = {
      raw: { transactionId: '0.0.1001@123.456', status: Status.Success },
      humanMessage: 'Successfully updated stablecoin.',
    };
    (handleTransaction as any).mockResolvedValue(fakeResponse);

    const params = { tokenId: '0.0.5555', name: 'NewName' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res).toEqual(fakeResponse);
    expect(StableCoin.buildUpdate).toHaveBeenCalledWith(expect.objectContaining({
        tokenId: '0.0.5555',
        name: 'NewName'
    }));
  });

  it('should update metadata successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildUpdate as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });
    
    const fakeResponse = {
      raw: { transactionId: '0.0.1001@123.456', status: Status.Success },
      humanMessage: 'Successfully updated stablecoin.',
    };
    (handleTransaction as any).mockResolvedValue(fakeResponse);

    const params = { tokenId: '0.0.5555', metadata: 'Updated metadata' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res).toEqual(fakeResponse);
    expect(StableCoin.buildUpdate).toHaveBeenCalledWith(expect.objectContaining({
        tokenId: '0.0.5555',
        metadata: 'Updated metadata'
    }));
  });

  it('should update role keys successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildUpdate as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });
    
    const fakeResponse = {
      raw: { transactionId: '0.0.1001@123.456', status: Status.Success },
      humanMessage: 'Successfully updated stablecoin.',
    };
    (handleTransaction as any).mockResolvedValue(fakeResponse);

    const params = { 
        tokenId: '0.0.5555', 
        kycKey: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
        wipeKey: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
        freezeKey: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
        pauseKey: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
        feeScheduleKey: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e'
    };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res).toEqual(fakeResponse);
    expect(StableCoin.buildUpdate).toHaveBeenCalledWith(expect.objectContaining({
        tokenId: '0.0.5555',
        kycKey: expect.objectContaining({ key: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', type: 'ED25519' }),
        wipeKey: expect.objectContaining({ key: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', type: 'ED25519' }),
        freezeKey: expect.objectContaining({ key: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', type: 'ED25519' }),
        pauseKey: expect.objectContaining({ key: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', type: 'ED25519' }),
        feeScheduleKey: expect.objectContaining({ key: '302a300506032b65702100a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', type: 'ED25519' })
    }));
  });

  it('should clear keys when passing empty string', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin, Account } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildUpdate as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });
    
    const fakeResponse = {
      raw: { transactionId: '0.0.1001@123.456', status: Status.Success },
      humanMessage: 'Successfully updated stablecoin.',
    };
    (handleTransaction as any).mockResolvedValue(fakeResponse);

    const params = { 
        tokenId: '0.0.5555', 
        kycKey: '',
        wipeKey: '',
    };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res).toEqual(fakeResponse);
    expect(StableCoin.buildUpdate).toHaveBeenCalledWith(expect.objectContaining({
        tokenId: '0.0.5555',
        kycKey: Account.NullPublicKey,
        wipeKey: Account.NullPublicKey
    }));
  });

  it('should return transaction in return-bytes mode', async () => {
    const tool = toolFactory(returnBytesContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildUpdate as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });

    const fakeReturnBytesResponse = { bytes: new Uint8Array([1, 2, 3]) };
    (handleTransaction as any).mockResolvedValueOnce(fakeReturnBytesResponse);

    const params = { tokenId: '0.0.5555', name: 'NewName' };
    const res: any = await tool.execute(client, returnBytesContext, params);

    expect(res).toEqual(fakeReturnBytesResponse);
  });

  it('should handle missing privateKey in autonomous mode', async () => {
    const tool = toolFactory(autonomousContext, { ...config, privateKey: undefined } as any);
    const client = makeClient();
    const params = { tokenId: '0.0.5555', name: 'NewName' };

    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('privateKey is required');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');

    (StableCoin.buildUpdate as any).mockRejectedValue(new Error('SDK Error'));

    const params = { tokenId: '0.0.5555', name: 'NewName' };
    const res = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to update stablecoin: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });
});
