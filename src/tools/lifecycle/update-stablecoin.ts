import { z } from 'zod';
import { Client, Status, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  Context,
  BaseTool,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { handleTransaction } from '@/shared/handle-transaction';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { StableCoin, UpdateRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const UPDATE_STABLECOIN_TOOL = 'update_stablecoin_tool';

const updateStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool updates the metadata of an existing stablecoin on the Hedera network. Only the admin key holder can update a stablecoin.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to update (e.g., "0.0.123456").
- name (str, optional): New name for the stablecoin.
- symbol (str, optional): New symbol for the stablecoin.
- metadata (str, optional): New metadata for the stablecoin (arbitrary data).
${usageInstructions}
`;
};

const updateStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    name: z.string().optional().describe('New name for the stablecoin'),
    symbol: z.string().optional().describe('New symbol for the stablecoin'),
    metadata: z.string().optional().describe('New metadata (arbitrary data)'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully updated stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class UpdateStablecoinTool extends BaseTool {
  method = UPDATE_STABLECOIN_TOOL;
  name = 'Update Stablecoin';
  description: string;
  parameters: ReturnType<typeof updateStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = updateStablecoinPrompt(context);
    this.parameters = updateStablecoinParameters(context);
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

    const requestConfig: any = { tokenId: params.tokenId };
    if (params.name !== undefined) requestConfig.name = params.name;
    if (params.symbol !== undefined) requestConfig.symbol = params.symbol;
    if (params.metadata !== undefined) requestConfig.metadata = params.metadata;

    return new UpdateRequest(requestConfig);
  }

  async coreAction(request: UpdateRequest, _context: Context, _client: Client) {
    const response = await StableCoin.buildUpdate(request);
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
    const desc = 'Failed to update stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new UpdateStablecoinTool(context, config);

export default tool;
