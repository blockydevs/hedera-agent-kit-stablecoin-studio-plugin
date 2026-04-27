import { z } from 'zod';
import { Client, Status, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  Context,
  BaseTool,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { handleTransaction } from '@/shared/handle-transaction';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import {
  StableCoin,
  CreateHoldRequest,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
  hexToUint8Array,
} from '@/stablecoin-sdk-utils';

export const CREATE_HOLD_STABLECOIN_TOOL = 'create_hold_stablecoin_tool';

const createHoldPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool creates a token hold (escrow) for a stablecoin on the Hedera network. Tokens are locked until the hold is executed, released, or expired. Amounts are in display units (human-readable).

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- amount (str, required): The amount of tokens to hold in display units (e.g., "50.5"). The tool will handle parsing to base units.
- escrow (str, required): The account ID of the escrow agent (who can execute/release).
- expirationDate (str, required): Unix timestamp (seconds) when the hold expires.
- accountId (str, optional): The Hedera account ID for the hold.
${usageInstructions}
`;
};

const createHoldParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    amount: z
      .string()
      .describe('The amount of tokens to hold in display units (human-readable, e.g. "100.5")'),
    escrow: z.string().describe('The account ID of the escrow agent (e.g., "0.0.789012")'),
    expirationDate: z.string().describe('Unix timestamp (seconds) for expiration'),
    accountId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID for the hold (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Hold created successfully.
Transaction ID: ${response.transactionId}`;
};

export class CreateHoldStablecoinTool extends BaseTool {
  method = CREATE_HOLD_STABLECOIN_TOOL;
  name = 'Create Hold';
  description: string;
  parameters: ReturnType<typeof createHoldParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = createHoldPrompt(context);
    this.parameters = createHoldParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    if (context.mode !== AgentMode.RETURN_BYTES && !this.config.privateKey) {
      throw new Error(
        'privateKey is required in plugin config for AUTONOMOUS mode. Provide it via createStablecoinStudioPlugin({ privateKey: "..." }).',
      );
    }

    const network = resolveNetwork(client, this.config);
    await initSdk(network, this.config);
    await connectSdk(network, this.config, context);

    return new CreateHoldRequest({
      tokenId: params.tokenId,
      amount: params.amount,
      escrow: params.escrow,
      expirationDate: params.expirationDate,
      targetId: params.accountId,
    });
  }

  async coreAction(request: CreateHoldRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildCreateHold(request);
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
    const desc = 'Failed to create hold';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new CreateHoldStablecoinTool(context, config);

export default tool;
