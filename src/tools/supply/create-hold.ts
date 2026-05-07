import { z } from 'zod';
import { Client, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  Context,
  BaseTool,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { handleTransaction } from '@/shared/utils/handle-transaction';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { extractHoldIdFromRecord } from '@/shared/utils/token-utils';
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
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';
import { resolveExpirationDate } from '@/shared/utils/duration-parser';
import { TransactionRecord } from '@hiero-ledger/sdk';

export const CREATE_HOLD_STABLECOIN_TOOL = 'create_hold_stablecoin_tool';

const createHoldPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Creates a token hold (escrow) for a stablecoin on the Hedera network. Tokens are locked until the hold is executed, released, or expired.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")
- amount: The amount of tokens to hold (e.g., "50.5")
- escrow: The account ID of the escrow agent (who can execute/release)
- expirationDate: Expiration for the hold. Accepts absolute Unix timestamps in seconds OR relative durations (e.g., "1h", "2d", "30m").

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- accountId: Defaults to the user account in context.
- amount is in display units (human-readable), the tool will handle parsing to base units.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const createHoldParameters = (context: Context = {}) => {
  const accountId = context.accountId || '';
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    amount: z
      .string()
      .describe('The amount of tokens to hold in display units (human-readable, e.g. "100.5")'),
    escrow: z.string().describe('The account ID of the escrow agent (e.g., "0.0.789012")'),
    expirationDate: z
      .string()
      .describe('Unix timestamp (seconds) or relative duration (e.g., "1h") for expiration'),
    accountId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID that will receive the tokens form the hold (e.g., "0.0.789012"). Default: ${accountId}`,
      ),
  });
};

const postProcess = (response: RawTransactionResponse & { holdId?: string }) => {
  return `Hold created successfully.
Hold ID: ${response.holdId || 'N/A'}
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

    const expirationDate = resolveExpirationDate(params.expirationDate);

    return new CreateHoldRequest({
      tokenId: params.tokenId,
      amount: params.amount,
      escrow: params.escrow,
      expirationDate: expirationDate,
      targetId: params.accountId,
    });
  }

  async coreAction(request: CreateHoldRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildCreateHold(request);
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

  extendResponse = async (
    raw: RawTransactionResponse,
    record: TransactionRecord,
  ): Promise<RawTransactionResponse & { holdId?: string }> => {
    return { ...raw, holdId: extractHoldIdFromRecord(record) || undefined };
  };

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(
      transaction,
      client,
      context,
      postProcess as any,
      this.extendResponse,
    );
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to create hold';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: extractStatus(error), error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new CreateHoldStablecoinTool(context, config);

export default tool;
