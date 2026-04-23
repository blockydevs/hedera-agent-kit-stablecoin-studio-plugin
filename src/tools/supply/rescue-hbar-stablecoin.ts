import { z } from 'zod';
import { Client, Status, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  Context,
  BaseTool,
  handleTransaction,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { RescueHBARRequest, StableCoin } from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const RESCUE_HBAR_STABLECOIN_TOOL = 'rescue_hbar_stablecoin_tool';

const rescueHbarStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool rescues HBAR from the stablecoin contract to a specified account. Requires the rescue role.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, optional): The Hedera account ID to receive rescued HBAR (e.g., "0.0.789012"). If not provided, defaults to the user account in context.
- amount (str, required): The amount of HBAR to rescue (e.g., "10.5").
${usageInstructions}
`;
};

const rescueHbarStablecoinParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to receive rescued HBAR (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
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
      startDate: params.startDate,
    });
  }

  async coreAction(request: RescueHBARRequest, _context: Context, _client: Client) {
    const response = await StableCoin.buildRescueHBAR(request);
    const bytes = hexToUint8Array(response.serializedTransaction);
    return Transaction.fromBytes(bytes);
  }

  async shouldSecondaryAction() {
    return true;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    if (context.mode === AgentMode.RETURN_BYTES) {
      return {
        raw: transaction,
        humanMessage: 'Transaction ready for signing.',
      };
    }
    return await handleTransaction(transaction, client, context, postProcess);
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to rescue HBAR from stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new RescueHbarStablecoinTool(context, config);

export default tool;
