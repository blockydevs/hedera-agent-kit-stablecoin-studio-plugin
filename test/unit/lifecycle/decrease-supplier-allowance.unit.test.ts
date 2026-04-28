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
    Role: { buildDecreaseAllowance: vi.fn() },
    DecreaseSupplierAllowanceRequest: class { constructor(x: any) { Object.assign(this, x); } },
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
  hexToUint8Array: vi.fn(() => new Uint8Array()),
  extractStatus: vi.fn(() => Status.InvalidTransaction),
}));

vi.mock('@/shared/handle-transaction', () => ({
  handleTransaction: vi.fn(),
}));

import toolFactory, { DECREASE_SUPPLIER_ALLOWANCE_TOOL } from '@/tools/lifecycle/decrease-supplier-allowance';

const makeClient = () => Client.forNetwork({});

describe('decrease-supplier-allowance tool (unit)', () => {
  const config = { accountId: '0.0.1001', privateKey: '302e020100300506032b657004220420...', network: 'testnet' };
  const autonomousContext: any = { mode: AgentMode.AUTONOMOUS, accountId: '0.0.1001' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose the correct method and name', () => {
    const tool = toolFactory(autonomousContext, config);
    expect(tool.method).toBe(DECREASE_SUPPLIER_ALLOWANCE_TOOL);
    expect(tool.name).toBe('Decrease Supplier Allowance');
  });

  it('should decrease supplier allowance successfully', async () => {
    const tool = toolFactory(autonomousContext, config);
    const client = makeClient();

    const { Role } = await import('@hashgraph/stablecoin-npm-sdk');
    const { handleTransaction } = await import('@/shared/handle-transaction');

    (Role.buildDecreaseAllowance as any).mockResolvedValue({
      serializedTransaction: 'hex-bytes',
    });

    const fakeResponse = {
      raw: { status: 'SUCCESS', transactionId: 'tx-id' },
      humanMessage: 'Success',
    };
    (handleTransaction as any).mockResolvedValue(fakeResponse);

    const params = { tokenId: '0.0.5555', targetId: '0.0.6666', amount: '50' };
    const res: any = await tool.execute(client, autonomousContext, params);

    expect(res).toEqual(fakeResponse);
    expect(Role.buildDecreaseAllowance).toHaveBeenCalled();
    expect(handleTransaction).toHaveBeenCalled();
  });
});
