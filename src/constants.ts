// Addresses sourced from stablecoin-studio documentation (v4.0.0)
// https://github.com/hashgraph/stablecoin-studio/blob/main/documentation/FACTORY_VERSION.md
// https://github.com/hashgraph/stablecoin-studio/blob/main/documentation/RESOLVER_VERSION.md

const STABLECOIN_FACTORY_ADDRESSES: Map<string, string> = new Map([['testnet', '0.0.7353542']]);

const STABLECOIN_RESOLVER_ADDRESSES: Map<string, string> = new Map([['testnet', '0.0.7353500']]);

export function getFactoryAddress(network: string): string {
  const address = STABLECOIN_FACTORY_ADDRESSES.get(network);
  if (!address) {
    throw new Error(
      `No default factory address for network "${network}". Provide factoryAddress in plugin config.`,
    );
  }
  return address;
}

export function getResolverAddress(network: string): string {
  const address = STABLECOIN_RESOLVER_ADDRESSES.get(network);
  if (!address) {
    throw new Error(
      `No default resolver address for network "${network}". Provide resolverAddress in plugin config.`,
    );
  }
  return address;
}

// Diamond proxy configuration ID for standard stablecoin facets
export const STABLECOIN_CONFIG_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000002';

// Initial deployment version of the facet configuration
export const STABLECOIN_CONFIG_VERSION = 1;
