import { TokenId, TransactionRecord } from '@hiero-ledger/sdk';

/**
 * Extracts a created Token ID from the contract function result bytes of a TransactionRecord.
 * 
 * This is specifically designed for transactions that call the Stablecoin Studio factory
 * contract's `deployStableCoin` function. The factory contract returns three 32-byte words:
 * 1. The address of the Stablecoin Proxy
 * 2. The address of the Stablecoin Implementation (which is used as the HTS Token ID)
 * 3. The address of the Reserve Proxy
 * 
 * This utility extracts the 2nd word (bytes 32-63) and converts it to a TokenId.
 * 
 * @param record - The TransactionRecord containing the contract function result.
 * @returns The extracted TokenId, or null if it cannot be extracted or is a zero address.
 */
export const extractTokenIdFromFactoryRecord = (record: TransactionRecord): TokenId | null => {
  const bytes = record.contractFunctionResult?.bytes;
  
  // We expect at least two 32-byte words (64 bytes)
  if (!bytes || bytes.length < 64) {
    return null;
  }

  // Extract the 2nd 32-byte word (bytes 32-63)
  // Solidity addresses are right-aligned in 32-byte words, so the actual address 
  // is in the last 20 bytes of the word.
  // Word 1 starts at byte 32. Word 1 ends at byte 63.
  // Byte 32-43 are padding. Byte 44-63 are the address.
  const tokenAddressBytes = bytes.slice(44, 64);
  
  // Check if it's the zero address
  const isZero = tokenAddressBytes.every(b => b === 0);
  if (isZero) {
    return null;
  }

  const tokenAddressHex = Buffer.from(tokenAddressBytes).toString('hex');

  return TokenId.fromEvmAddress(0, 0, `0x${tokenAddressHex}`);
};

/**
 * Extracts a Hold ID from the contract function result bytes of a TransactionRecord.
 *
 * This is designed for transactions that call createHold or createHoldByController.
 * These functions return (bool success, uint256 holdId).
 *
 * This utility extracts the 2nd word (bytes 32-63) and converts it to a string.
 *
 * @param record - The TransactionRecord containing the contract function result.
 * @returns The extracted Hold ID as a string, or null if it cannot be extracted.
 */
export const extractHoldIdFromRecord = (record: TransactionRecord): string | null => {
  const bytes = record.contractFunctionResult?.bytes;

  // We expect at least two 32-byte words (64 bytes)
  if (!bytes || bytes.length < 64) {
    return null;
  }

  // Extract the 2nd 32-byte word (bytes 32-63)
  const holdIdBytes = bytes.slice(32, 64);

  const hex = Buffer.from(holdIdBytes).toString('hex');
  return BigInt(`0x${hex}`).toString();
};
