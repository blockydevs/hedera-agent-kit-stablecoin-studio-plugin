import { z } from 'zod';
import { Client, Status, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  Context,
  BaseTool,
  PromptGenerator,
  handleTransaction,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import {
  StableCoin,
  RescueRequest,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const RESCUE_STABLECOIN_TOOL = 'rescue_stablecoin_tool';

const rescueStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool rescues (recovers) stablecoin tokens from the token's smart contract treasury. Requires the rescue role.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- amount (str, required): The amount of tokens to rescue in display units (e.g., "100.5"). The tool will handle parsing to base units.
- startDate (str, optional): ISO 8601 date for scheduling the operation.
${usageInstructions}
`;
};

const rescueStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    amount: z
      .string()
      .describe('The amount of tokens to rescue in display units (human-readable, e.g. "100.5")'),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully rescued tokens for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class RescueStablecoinTool extends BaseTool {
  method = RESCUE_STABLECOIN_TOOL;
  name = 'Rescue Stablecoin';
  description: string;
  parameters: ReturnType<typeof rescueStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = rescueStablecoinPrompt(context);
    this.parameters = rescueStablecoinParameters(context);
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

    return new RescueRequest({
      tokenId: params.tokenId,
      amount: params.amount,
      startDate: params.startDate,
    });
  }

  async coreAction(request: RescueRequest, _context: Context, _client: Client) {
    const response = await StableCoin.buildRescue(request);
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
    const desc = 'Failed to rescue stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new RescueStablecoinTool(context, config);

export default tool;
