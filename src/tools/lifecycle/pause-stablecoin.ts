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
import { StableCoin, PauseRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const PAUSE_STABLECOIN_TOOL = 'pause_stablecoin_tool';

const pauseStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool pauses a stablecoin on the Hedera network, preventing all token transfers while preserving balances and ownership. Requires the pause key.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to pause (e.g., "0.0.123456").
${usageInstructions}
`;
};

const pauseStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully paused stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class PauseStablecoinTool extends BaseTool {
  method = PAUSE_STABLECOIN_TOOL;
  name = 'Pause Stablecoin';
  description: string;
  parameters: ReturnType<typeof pauseStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = pauseStablecoinPrompt(context);
    this.parameters = pauseStablecoinParameters(context);
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

    return new PauseRequest({ tokenId: params.tokenId });
  }

  async coreAction(request: PauseRequest, _context: Context, _client: Client) {
    const response = await StableCoin.buildPause(request);
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
    const desc = 'Failed to pause stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new PauseStablecoinTool(context, config);

export default tool;
