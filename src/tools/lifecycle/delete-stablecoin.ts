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
  DeleteRequest,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const DELETE_STABLECOIN_TOOL = 'delete_stablecoin_tool';

const deleteStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Permanently deletes a stablecoin. This action is IRREVERSIBLE. Requires zero total supply and the delete role.

MANDATORY: Show a complete execution plan and wait for explicit user approval ("yes", "confirm", "proceed") BEFORE calling this tool. NEVER call this tool without approval, UNLESS the user has already provided explicit confirmation in the current request (e.g., "proceed immediately").

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin to delete (e.g., "0.0.123456")

ALL other parameters are optional. NEVER ask the user about them.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
WARNING: Remind the user that this action is permanent and irreversible.
${usageInstructions}
`;
};

const deleteStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully deleted stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class DeleteStablecoinTool extends BaseTool {
  method = DELETE_STABLECOIN_TOOL;
  name = 'Delete Stablecoin';
  description: string;
  parameters: ReturnType<typeof deleteStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = deleteStablecoinPrompt(context);
    this.parameters = deleteStablecoinParameters(context);
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

    return new DeleteRequest({ tokenId: params.tokenId });
  }

  async coreAction(request: DeleteRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildDelete(request);
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
    const desc = 'Failed to delete stablecoin';
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
  new DeleteStablecoinTool(context, config);

export default tool;
