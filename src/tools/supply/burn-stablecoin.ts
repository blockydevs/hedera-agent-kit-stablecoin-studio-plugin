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
  BurnRequest,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const BURN_STABLECOIN_TOOL = 'burn_stablecoin_tool';

const burnStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool burns (destroys) a specified amount of stablecoin tokens from the treasury account. Requires the burn role.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- amount (str, required): The amount of tokens to burn in display units (e.g., "100.5"). The tool will handle parsing to base units.
- startDate (str, optional): ISO 8601 date for scheduling the operation.
${usageInstructions}
`;
};

const burnStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    amount: z
      .string()
      .describe('The amount of tokens to burn in display units (human-readable, e.g. "100.5")'),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully burned tokens for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class BurnStablecoinTool extends BaseTool {
  method = BURN_STABLECOIN_TOOL;
  name = 'Burn Stablecoin';
  description: string;
  parameters: ReturnType<typeof burnStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = burnStablecoinPrompt(context);
    this.parameters = burnStablecoinParameters(context);
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

    return new BurnRequest({
      tokenId: params.tokenId,
      amount: params.amount,
      startDate: params.startDate,
    });
  }

  async coreAction(request: BurnRequest, _context: Context, _client: Client) {
    const response = await StableCoin.buildBurn(request);
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
    const desc = 'Failed to burn stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new BurnStablecoinTool(context, config);

export default tool;
