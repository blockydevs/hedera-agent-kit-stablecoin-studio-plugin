import { Client, PrivateKey } from '@hiero-ledger/sdk';
import { Context } from '@hashgraph/hedera-agent-kit';
import {
  Network,
  ConnectRequest,
  InitializationRequest,
  SupportedWallets,
} from '@hashgraph/stablecoin-npm-sdk';
import { getFactoryAddress, getResolverAddress } from './constants';

export type StablecoinStudioPluginConfig = {
  accountId: string;
  privateKey?: string;
  network?: string;
  factoryAddress?: string;
  resolverAddress?: string;
};

export function resolveNetwork(client: Client, config: StablecoinStudioPluginConfig): string {
  const network = client.ledgerId?.toString() ?? config.network;
  if (!network) {
    throw new Error(
      'Unable to determine network. Either connect the client to a network or provide "network" in plugin config.',
    );
  }
  return network;
}

export async function initSdk(
  network: string,
  config: StablecoinStudioPluginConfig,
): Promise<void> {
  const factoryAddress = config.factoryAddress ?? getFactoryAddress(network);
  const resolverAddress = config.resolverAddress ?? getResolverAddress(network);

  await Network.init(
    new InitializationRequest({
      network,
      mirrorNode: { baseUrl: `https://${network}.mirrornode.hedera.com/api/v1/` },
      rpcNode: { baseUrl: `https://${network}.hashio.io/api` },
      configuration: { factoryAddress, resolverAddress },
    } as any),
  );
}

// Used by all tools — build* methods require EXTERNAL_HEDERA to return serializedTransactionData
export async function connectSdk(
  network: string,
  config: StablecoinStudioPluginConfig,
  context: Context,
): Promise<void> {
  const accountId = (context as any).accountId || config.accountId;
  const request = new ConnectRequest({
    account: { accountId },
    network,
    wallet: SupportedWallets.EXTERNAL_HEDERA,
    mirrorNode: { baseUrl: `https://${network}.mirrornode.hedera.com/api/v1/` },
    rpcNode: { baseUrl: `https://${network}.hashio.io/api` },
    externalWalletSettings: { validStartOffsetMinutes: 0 },
  });

  await Network.connect(request);
}

// Used for direct SDK calls (StableCoin.create, StableCoin.cashIn, etc.)
// CLIENT wallet executes transactions immediately without returning serialized bytes
export async function connectSdkClientMode(
  network: string,
  config: StablecoinStudioPluginConfig,
): Promise<void> {
  const account: any = { accountId: config.accountId };
  if (config.privateKey) {
    try {
      PrivateKey.fromStringECDSA(config.privateKey);
      account.privateKey = { key: config.privateKey, type: 'ECDSA' };
    } catch (e) {
      throw new Error(
        `Failed to parse private key as ECDSA: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const request = new ConnectRequest({
    account,
    network,
    wallet: SupportedWallets.CLIENT,
    mirrorNode: { baseUrl: `https://${network}.mirrornode.hedera.com/api/v1/` },
    rpcNode: { baseUrl: `https://${network}.hashio.io/api` },
    externalWalletSettings: { validStartOffsetMinutes: 0 },
  });

  await Network.connect(request);
}
export async function ensureSdkConnected(
  client: Client,
  config: StablecoinStudioPluginConfig,
  context: Context,
): Promise<void> {
  const network = resolveNetwork(client, config);
  await initSdk(network, config);
  await connectSdk(network, config, context);
}

export function hexToUint8Array(hex: string): Uint8Array {
  if (!hex) {
    throw new Error('hexToUint8Array: hex string is undefined or empty');
  }
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}
