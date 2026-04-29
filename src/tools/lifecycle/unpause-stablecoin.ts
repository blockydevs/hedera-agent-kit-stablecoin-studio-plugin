import { z } from 'zod';
import { Client, Status, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  Context,
  BaseTool,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { handleTransaction } from '@/shared/utils/handle-transaction';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { StableCoin, PauseRequest, SerializedTransactionData } from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/shared/utils/stablecoin-sdk-utils';

export const UNPAUSE_STABLECOIN_TOOL = 'unpause_stablecoin_tool';

const unpauseStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool unpauses a stablecoin on the Hedera network, re-enabling all token operations that were halted by a previous pause. Requires the pause key.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to unpause (e.g., "0.0.123456").
${usageInstructions}
`;
};

const unpauseStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully unpaused stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class UnpauseStablecoinTool extends BaseTool {
  method = UNPAUSE_STABLECOIN_TOOL;
  name = 'Unpause Stablecoin';
  description: string;
  parameters: ReturnType<typeof unpauseStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = unpauseStablecoinPrompt(context);
    this.parameters = unpauseStablecoinParameters(context);
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
    const response: SerializedTransactionData = await StableCoin.buildUnPause(request);
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
    const desc = 'Failed to unpause stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new UnpauseStablecoinTool(context, config);

export default tool;
