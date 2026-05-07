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
import {
  StableCoin,
  ReleaseHoldRequest,
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

export const RELEASE_HOLD_STABLECOIN_TOOL = 'release_hold_stablecoin_tool';

const releaseHoldPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Releases a previously created token hold, returning the tokens to the source account. Requires the escrow role for that hold.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")
- holdId: The numeric ID of the hold (e.g., 123)
- amount: The amount of tokens to release (e.g., "50.5")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- sourceId: Defaults to the user account in context.
- amount is in display units (human-readable), the tool will handle parsing to base units.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const releaseHoldParameters = (context: Context = {}) => {
  const accountId = context.accountId || '';
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    holdId: z.number().int().describe('The ID of the hold to release'),
    amount: z
      .string()
      .describe('The amount of tokens to release in display units (human-readable, e.g. "50.5")'),
    sourceId: z
      .string()
      .optional()
      .default(accountId)
      .describe(`The source account ID (origin of the hold). Default: ${accountId}`),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully released hold for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class ReleaseHoldStablecoinTool extends BaseTool {
  method = RELEASE_HOLD_STABLECOIN_TOOL;
  name = 'Release Hold';
  description: string;
  parameters: ReturnType<typeof releaseHoldParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = releaseHoldPrompt(context);
    this.parameters = releaseHoldParameters(context);
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

    return new ReleaseHoldRequest({
      tokenId: params.tokenId,
      holdId: params.holdId,
      amount: params.amount,
      sourceId: params.sourceId,
    });
  }

  async coreAction(request: ReleaseHoldRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildReleaseHold(request);
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

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, postProcess);
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to release hold';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: extractStatus(error), error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new ReleaseHoldStablecoinTool(context, config);

export default tool;
