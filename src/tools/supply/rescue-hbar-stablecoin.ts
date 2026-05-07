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
  RescueHBARRequest,
  SerializedTransactionData,
  StableCoin,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const RESCUE_HBAR_STABLECOIN_TOOL = 'rescue_hbar_stablecoin_tool';

const rescueHbarStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Rescues HBAR from the stablecoin contract to the treasury account. Requires the rescue role.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")
- amount: The amount of HBAR to rescue (e.g., "10.5")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- amount is in HBAR.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const rescueHbarStablecoinParameters = (_context: Context = {}) => {
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    amount: z.string().describe('The amount of HBAR to rescue (e.g., "10.5")'),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully rescued HBAR for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class RescueHbarStablecoinTool extends BaseTool {
  method = RESCUE_HBAR_STABLECOIN_TOOL;
  name = 'Rescue HBAR Stablecoin';
  description: string;
  parameters: ReturnType<typeof rescueHbarStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = rescueHbarStablecoinPrompt(context);
    this.parameters = rescueHbarStablecoinParameters(context);
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

    return new RescueHBARRequest({
      tokenId: params.tokenId,
      amount: params.amount,
    });
  }

  async coreAction(request: RescueHBARRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildRescueHBAR(request);
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
    const desc = 'Failed to rescue HBAR from stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: extractStatus(error), error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new RescueHbarStablecoinTool(context, config);

export default tool;
