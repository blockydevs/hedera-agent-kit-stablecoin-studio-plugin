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
import { StableCoin, ReclaimHoldRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
  hexToUint8Array,
} from '@/stablecoin-sdk-utils';

export const RECLAIM_HOLD_STABLECOIN_TOOL = 'reclaim_hold_stablecoin_tool';

const reclaimHoldPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool reclaims an expired token hold for a stablecoin on the Hedera network, returning the tokens to the source account. This can only be called if the hold has passed its expiration date.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- holdId (number, required): The ID of the hold to reclaim (e.g., 123).
- sourceId (str, required): The account ID from which the tokens were held (origin).
${usageInstructions}
`;
};

const reclaimHoldParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    holdId: z.number().int().describe('The ID of the hold to reclaim'),
    sourceId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The source account ID (origin) to return tokens to. Default: ${accountId || 'operator account'}`,
      ),
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

    // In this new pattern, we always need both SDK and kit connection.
    // However, if we only need to BUILD, we don't need the private key in config.
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
    // We always build the transaction using the SDK.
    const response = await StableCoin.buildReclaimHold(request);
    const bytes = hexToUint8Array(response.serializedTransaction);
    return Transaction.fromBytes(bytes);
  }

  async shouldSecondaryAction() {
    return true;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    console.log('DEBUG Tool context.mode:', context.mode, 'AgentMode.RETURN_BYTES:', AgentMode.RETURN_BYTES);
    if (context.mode === AgentMode.RETURN_BYTES) {
      return {
        raw: transaction,
        humanMessage: 'Transaction ready for signing.',
      };
    }
    return await handleTransaction(transaction, client, context, postProcess);
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to reclaim hold';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new ReclaimHoldStablecoinTool(context, config);

export default tool;
