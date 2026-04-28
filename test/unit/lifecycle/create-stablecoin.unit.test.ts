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
    StableCoin: { buildCreate: vi.fn() },
    CreateRequest: class { constructor(x: any) { Object.assign(this, x); } },
    Account: { NullPublicKey: '0x00' },
    TokenSupplyType: { FINITE: 'FINITE', INFINITE: 'INFINITE' },
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
}));

vi.mock('@/shared/handle-transaction', () => ({
  handleTransaction: vi.fn(),
}));

import toolFactory, { CREATE_STABLECOIN_TOOL } from '@/tools/lifecycle/create-stablecoin';

const makeClient = () => Client.forNetwork({});

describe('create-stablecoin tool (unit)', () => {
  const config = { accountId: '0.0.1001', privateKey: '302e020100300506032b657004220420...', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };
  const returnBytesContext: any = { mode: AgentMode.RETURN_BYTES, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(CREATE_STABLECOIN_TOOL);
    expect(tool.name).toBe('Create Stablecoin');
  });

  it('should create stablecoin successfully in autonomous mode', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildCreate as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });
    
    const fakeResponse = {
      raw: { transactionId: '0.0.1001@123.456', status: Status.Success, tokenId: '0.0.5555' },
      humanMessage: 'Stablecoin created successfully. ID: 0.0.5555\nTransaction ID: 0.0.1001@123.456',
    };
    (handleTransaction as any).mockResolvedValue(fakeResponse);

    const params = { name: 'Test', symbol: 'TST' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res).toEqual(fakeResponse);
    expect(StableCoin.buildCreate).toHaveBeenCalled();
  });

  it('should pass new optional parameters to the SDK', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    
    (StableCoin.buildCreate as any).mockResolvedValue({ serializedTransaction: '1234' });

    const params = { 
      name: 'Test', 
      symbol: 'TST',
      metadata: 'test metadata',
      freezeDefault: true,
      autoRenewAccount: '0.0.789',
      autoRenewPeriod: 8000000,
      cashInRoleAllowance: '5000',
      holdCreatorRoleAccount: '0.0.1002',
      reserveAddress: '0.0.333',
      reserveInitialAmount: '1000',
      grantKYCToOriginalSender: false,
      stableCoinFactory: '0.0.444'
    };
    
    await tool.execute(client, autonomousContext, params);

    expect(StableCoin.buildCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test',
      symbol: 'TST',
      metadata: 'test metadata',
      freezeDefault: true,
      autoRenewAccount: '0.0.789',
      autoRenewPeriod: 8000000,
      cashInRoleAllowance: '5000',
      holdCreatorRoleAccount: '0.0.1002',
      reserveAddress: '0.0.333',
      reserveInitialAmount: '1000',
      grantKYCToOriginalSender: false,
      stableCoinFactory: '0.0.444'
    }));
  });

  it('should correctly process and pass HTS keys to the SDK', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin, Account } = await import('@hashgraph/stablecoin-npm-sdk');
    const { parsePublicKey } = await import('@/stablecoin-sdk-utils');
    
    (StableCoin.buildCreate as any).mockResolvedValue({ serializedTransaction: '1234' });

    const params = { 
      name: 'Test', 
      symbol: 'TST',
      freezeKey: '0x123',
      kycKey: 'null',
      wipeKey: '0x456',
      pauseKey: 'null',
      feeScheduleKey: '0x789'
    };
    
    await tool.execute(client, autonomousContext, params);

    expect(parsePublicKey).toHaveBeenCalledWith('0x123');
    expect(parsePublicKey).toHaveBeenCalledWith('0x456');
    expect(parsePublicKey).toHaveBeenCalledWith('0x789');

    expect(StableCoin.buildCreate).toHaveBeenCalledWith(expect.objectContaining({
      freezeKey: { key: '0x123', type: 'ED25519' },
      kycKey: Account.NullPublicKey,
      wipeKey: { key: '0x456', type: 'ED25519' },
      pauseKey: Account.NullPublicKey,
      feeScheduleKey: { key: '0x789', type: 'ED25519' }
    }));
  });

  it('should return transaction in return-bytes mode', async () => {
    const tool = toolFactory(returnBytesContext, config);
    const client = makeClient();

    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    const fakeTxBytes = '1234';
    (StableCoin.buildCreate as any).mockResolvedValue({ serializedTransaction: fakeTxBytes });

    const fakeReturnBytesResponse = { bytes: new Uint8Array([1, 2, 3]) };
    (handleTransaction as any).mockResolvedValueOnce(fakeReturnBytesResponse);

    const params = { name: 'Test', symbol: 'TST' };
    const res: any = await tool.execute(client, returnBytesContext, params);

    expect(res).toEqual(fakeReturnBytesResponse);
  });

  it('should handle missing privateKey in autonomous mode', async () => {
    const tool = toolFactory(autonomousContext, { ...config, privateKey: undefined } as any);
    const client = makeClient();
    const params = { name: 'Test', symbol: 'TST' };

    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('privateKey is required');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });

  it('should handle SDK errors', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();
    const { StableCoin } = await import('@hashgraph/stablecoin-npm-sdk');

    (StableCoin.buildCreate as any).mockRejectedValue(new Error('SDK Error'));

    const params = { name: 'Test', symbol: 'TST' };
    const res = await tool.execute(client, autonomousContext, params);

    expect(res.humanMessage).toContain('Failed to create stablecoin: SDK Error');
    expect(res.raw.status).toBe(Status.InvalidTransaction);
  });
});
