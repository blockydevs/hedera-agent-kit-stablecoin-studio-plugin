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
  ReclaimHoldRequest,
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

export const RECLAIM_HOLD_STABLECOIN_TOOL = 'reclaim_hold_stablecoin_tool';

const reclaimHoldPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Reclaims an expired token hold, returning the tokens to the source account. This can only be called if the hold has passed its expiration date.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")
- holdId: The numeric ID of the hold (e.g., 123)

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- sourceId: Defaults to the user account in context.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const reclaimHoldParameters = (context: Context = {}) => {
  const accountId = context.accountId || '';
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    holdId: z.number().int().describe('The ID of the hold to reclaim'),
    sourceId: z
      .string()
      .optional()
      .default(accountId)
      .describe(`The source account ID (origin) to return tokens to. Default: ${accountId}`),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully reclaimed hold for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class ReclaimHoldStablecoinTool extends BaseTool {
  method = RECLAIM_HOLD_STABLECOIN_TOOL;
  name = 'Reclaim Hold';
  description: string;
  parameters: ReturnType<typeof reclaimHoldParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = reclaimHoldPrompt(context);
    this.parameters = reclaimHoldParameters(context);
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

    return new ReclaimHoldRequest({
      tokenId: params.tokenId,
      holdId: params.holdId,
      sourceId: params.sourceId,
    });
  }

  async coreAction(request: ReclaimHoldRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildReclaimHold(request);
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
    const desc = 'Failed to reclaim hold';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: extractStatus(error), error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new ReclaimHoldStablecoinTool(context, config);

export default tool;
