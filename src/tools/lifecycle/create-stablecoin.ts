import { z } from 'zod';
import { Client, Status, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  BaseTool,
  Context,
  handleTransaction,
  PromptGenerator,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import {
  Account,
  CreateRequest,
  StableCoin,
  TokenSupplyType,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { STABLECOIN_CONFIG_ID, STABLECOIN_CONFIG_VERSION } from '@/constants';

export const CREATE_STABLECOIN_TOOL = 'create_stablecoin_tool';

const createStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);

  return `
${contextSnippet}
Creates a new stablecoin on Hedera using Stablecoin Studio.

MANDATORY: Show a complete execution plan and wait for explicit user approval ("yes", "confirm", "proceed") BEFORE calling this tool. NEVER call this tool without approval.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- name: Stablecoin name (e.g., "USD Coin")
- symbol: Token symbol (e.g., "USDC")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- decimals: 6, initialSupply: "0", supplyType: INFINITE, createReserve: false
- initialSupply and maxSupply are in display units (human-readable), the tool will handle parsing to base units.
- All role accounts default to operator account

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value), including required, optional, and role accounts. End with a confirmation request.
`;
};

const toSupplyType = (type: string) =>
  type === 'FINITE' ? TokenSupplyType.FINITE : TokenSupplyType.INFINITE;

const createStablecoinParameters = (_context: Context = {}, operatorAccount: string) =>
  z.object({
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
    createReserve: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to create a proof of reserve. Default: false'),
    proxyOwnerAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for proxy owner. Default: operator account'),
    burnRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for burn role. Default: operator account'),
    wipeRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for wipe role. Default: operator account'),
    rescueRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for rescue role. Default: operator account'),
    pauseRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for pause role. Default: operator account'),
    freezeRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for freeze role. Default: operator account'),
    deleteRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for delete role. Default: operator account'),
    kycRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for KYC role. Default: operator account'),
    cashInRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for cash-in role. Default: operator account'),
    feeRoleAccount: z
      .string()
      .optional()
      .default(operatorAccount)
      .describe('Account ID for fee role. Default: operator account'),
  });

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
    this.parameters = createStablecoinParameters(context, config.accountId);
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

    return new CreateRequest({
      ...params,
      freezeKey: Account.NullPublicKey,
      wipeKey: Account.NullPublicKey,
      pauseKey: Account.NullPublicKey,
      configId: STABLECOIN_CONFIG_ID,
      configVersion: STABLECOIN_CONFIG_VERSION,
    });
  }

  async coreAction(request: CreateRequest, _context: Context, _client: Client) {
    const response = await StableCoin.buildCreate(request);
    const bytes = hexToUint8Array(response.serializedTransaction);
    return Transaction.fromBytes(bytes);
  }

  async shouldSecondaryAction() {
    return true;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, postProcess);
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to create stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new CreateStablecoinTool(context, config);

export default tool;
