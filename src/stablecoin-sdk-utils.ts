import { Client } from '@hashgraph/sdk';
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

export async function connectSdk(
  network: string,
  config: StablecoinStudioPluginConfig,
  _context: Context,
): Promise<void> {
  const account: any = { accountId: config.accountId };
  if (config.privateKey) {
    const isEcdsa =
      config.privateKey.startsWith('0x') || config.privateKey.replace(/^0x/, '').length === 64;
    account.privateKey = { key: config.privateKey, type: isEcdsa ? 'ECDSA' : 'ED25519' };
  }

  const request = new ConnectRequest({
    account,
    network,
    wallet: SupportedWallets.CLIENT,
    mirrorNode: { baseUrl: `https://${network}.mirrornode.hedera.com/api/v1/` },
    rpcNode: { baseUrl: `https://${network}.hashio.io/api` },
  });

  await Network.connect(request);
}

export function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}
