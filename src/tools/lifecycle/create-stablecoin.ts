import { z } from 'zod';
import { Client, Transaction, TransactionRecord } from '@hiero-ledger/sdk';
import {
  AgentMode,
  BaseTool,
  Context,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { handleTransaction } from '@/shared/utils/handle-transaction';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import {
  Account,
  CreateRequest,
  SerializedTransactionData,
  StableCoin,
  TokenSupplyType,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  parsePublicKey,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';
import { STABLECOIN_CONFIG_ID, STABLECOIN_CONFIG_VERSION } from '@/shared/constants';
import { extractTokenIdFromFactoryRecord } from '@/shared/utils/token-utils';

export const CREATE_STABLECOIN_TOOL = 'create_stablecoin_tool';

const createStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Creates a new stablecoin on Hedera using Stablecoin Studio.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- name: Stablecoin name (e.g., "USD Coin")
- symbol: Token symbol (e.g., "USDC")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- decimals: 6, initialSupply: "0", supplyType: INFINITE, createReserve: false
- initialSupply and maxSupply are in display units (human-readable), the tool will handle parsing to base units.
- All role accounts default to the user account in context.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value), including required, optional, roles (Account ID or Public Key), and HTS keys. End with a confirmation request.
${usageInstructions}
`;
};

const toSupplyType = (type: string) =>
  type === 'FINITE' ? TokenSupplyType.FINITE : TokenSupplyType.INFINITE;

const createStablecoinParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId || '';

  return z.object({
    name: z.string().describe('The name of the stablecoin (e.g., "USD Coin")'),
    symbol: z.string().describe('The token symbol (e.g., "USDC")'),
    decimals: z
      .number()
      .min(0)
      .max(18)
      .optional()
      .default(6)
      .describe('Number of decimal places (0-18). Default: 6'),
    initialSupply: z
      .string()
      .optional()
      .default('0')
      .describe('Initial token supply in display units (e.g. "100.5"). Default: "0"'),
    maxSupply: z
      .string()
      .optional()
      .describe(
        'Maximum token supply in display units (e.g. "1000"). Only relevant when supplyType is FINITE',
      ),
    supplyType: z
      .enum(['FINITE', 'INFINITE'])
      .optional()
      .default('INFINITE')
      .describe('Supply type. Default: INFINITE')
      .transform(toSupplyType),
    metadata: z.string().optional().describe('Token metadata (arbitrary data)'),
    freezeDefault: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether accounts are frozen by default for this token. Default: false'),
    autoRenewAccount: z
      .string()
      .optional()
      .describe('Account ID for auto-renew charges (e.g., "0.0.789012")'),
    autoRenewPeriod: z
      .number()
      .optional()
      .describe('Auto-renew period in seconds (e.g., 7776000 for 90 days)'),
    cashInRoleAllowance: z
      .string()
      .optional()
      .describe('Initial allowance for the cash-in role in display units (e.g., "1000")'),
    createReserve: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to create a proof of reserve. Default: false'),
    proxyOwnerAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    burnRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    wipeRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    rescueRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    pauseRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    freezeRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    deleteRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    kycRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    cashInRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    feeRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    holdCreatorRoleAccount: z
      .string()
      .optional()
      .default(accountId)
      .describe(`Account ID or Public Key. Default: ${accountId}`),
    freezeKey: z
      .string()
      .optional()
      .describe('HTS Freeze key (Hex). Use "null" for no key. Default: "null"'),
    kycKey: z
      .string()
      .optional()
      .describe('HTS KYC key (Hex). Use "null" for no key. Default: "null"'),
    wipeKey: z
      .string()
      .optional()
      .describe('HTS Wipe key (Hex). Use "null" for no key. Default: "null"'),
    pauseKey: z
      .string()
      .optional()
      .describe('HTS Pause key (Hex). Use "null" for no key. Default: "null"'),
    feeScheduleKey: z.string().optional().describe('HTS Fee Schedule key (Hex)'),
    stableCoinFactory: z.string().optional().describe('Address of the stablecoin factory contract'),
    reserveAddress: z.string().optional().describe('Address of the reserve contract'),
    reserveInitialAmount: z
      .string()
      .optional()
      .describe('Initial amount for the reserve in display units'),
    grantKYCToOriginalSender: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to grant KYC to the creator. Default: true'),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  const tokenId = response.tokenId?.toString();
  return `Stablecoin created successfully.${tokenId ? ` ID: ${tokenId}` : ''}
Transaction ID: ${response.transactionId}`;
};

export class CreateStablecoinTool extends BaseTool {
  method = CREATE_STABLECOIN_TOOL;
  name = 'Create Stablecoin';
  description: string;
  parameters: ReturnType<typeof createStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = createStablecoinPrompt(context);
    this.parameters = createStablecoinParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    if (context.mode !== AgentMode.RETURN_BYTES && !this.config.privateKey) {
      throw new Error(
        'privateKey is required in plugin config for AUTONOMOUS mode. Provide it via createStablecoinStudioPlugin({ privateKey: "..." }).',
      );
    }

    await ensureSdkConnected(client, this.config, context);

    const processKey = (key: string | undefined, defaultValue: any) => {
      if (key === undefined) return defaultValue;
      if (key === 'null') return Account.NullPublicKey;
      try {
        return parsePublicKey(key);
      } catch (_e) {
        throw new Error(`Invalid public key provided: ${key}. Expected hex string.`);
      }
    };

    return new CreateRequest({
      configId: STABLECOIN_CONFIG_ID,
      configVersion: STABLECOIN_CONFIG_VERSION,
      stableCoinFactory: params.stableCoinFactory || this.config.factoryAddress,
      ...params,
      freezeKey: processKey(params.freezeKey, Account.NullPublicKey),
      wipeKey: processKey(params.wipeKey, Account.NullPublicKey),
      pauseKey: processKey(params.pauseKey, Account.NullPublicKey),
      kycKey: processKey(params.kycKey, Account.NullPublicKey),
      feeScheduleKey: processKey(params.feeScheduleKey, undefined),
    });
  }

  async coreAction(request: CreateRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildCreate(request);
    if (!response?.serializedTransaction) {
      throw new Error(
        'SDK failed to build the transaction: serializedTransaction is missing from the response.',
      );
    }

    const bytes = hexToUint8Array(response.serializedTransaction);
    return Transaction.fromBytes(bytes);
  }

  async shouldSecondaryAction() {
    return true;
  }

  /**
   * Extends the default transaction response by extracting the created Token ID from
   * the transaction record.
   *
   * This is required because `StableCoin.buildCreate(request)` generates a
   * `ContractExecuteTransaction`. Unlike native token creation, the resulting
   * Token ID is not present in the receipt and must be parsed from the
   * contract function result bytes.
   *
   * @param raw - The initial transaction response.
   * @param record - The transaction record containing contract execution results.
   * @returns The response extended with the parsed Token ID.
   */
  extendResponse = async (
    raw: RawTransactionResponse,
    record: TransactionRecord,
  ): Promise<RawTransactionResponse> => {
    return { ...raw, tokenId: extractTokenIdFromFactoryRecord(record) || null };
  };

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, postProcess, this.extendResponse);
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to create stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: {
        status: extractStatus(error),
        error: message,
      },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new CreateStablecoinTool(context, config);

export default tool;
