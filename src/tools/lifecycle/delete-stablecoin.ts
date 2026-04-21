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
import { StableCoin, DeleteRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const DELETE_STABLECOIN_TOOL = 'delete_stablecoin_tool';

const deleteStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool permanently deletes a stablecoin on the Hedera network. This action is irreversible. Deletion requires zero balances, an empty treasury, and DELETE role permissions.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to delete (e.g., "0.0.123456").
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
    const response = await StableCoin.buildDelete(request);
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
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new DeleteStablecoinTool(context, config);

export default tool;
