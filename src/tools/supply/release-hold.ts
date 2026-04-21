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
import { StableCoin, ReleaseHoldRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
  hexToUint8Array,
} from '@/stablecoin-sdk-utils';

export const RELEASE_HOLD_STABLECOIN_TOOL = 'release_hold_stablecoin_tool';

const releaseHoldPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool releases a previously created token hold for a stablecoin on the Hedera network, returning the tokens to the source account. Requires the escrow role for that hold.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- holdId (number, required): The ID of the hold to release (e.g., 123).
- amount (str, required): The amount of tokens to release (e.g., "50").
- sourceId (str, required): The account ID from which the tokens were held (where they will be returned).
${usageInstructions}
`;
};

const releaseHoldParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    holdId: z.number().int().describe('The ID of the hold to release'),
    amount: z.string().describe('The amount of tokens to release (e.g., "50")'),
    sourceId: z.string().describe('The source account ID to return tokens to'),
  });

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
    const response = await StableCoin.buildReleaseHold(request);
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
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new ReleaseHoldStablecoinTool(context, config);

export default tool;
