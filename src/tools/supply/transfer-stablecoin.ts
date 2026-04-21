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
  TransfersRequest,
  GetStableCoinDetailsRequest,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { toBaseUnit } from '@/decimals-utils';

export const TRANSFER_STABLECOIN_TOOL = 'transfer_stablecoin_tool';

const transferStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool transfers stablecoin tokens from one account to another on the Hedera network.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- senderId (str, required): The Hedera account ID sending the tokens (e.g., "0.0.789012").
- receiverId (str, required): The Hedera account ID receiving the tokens (e.g., "0.0.345678").
- amount (str, required): The amount of tokens to transfer in display units (human-readable, e.g. "100.5"). The tool will handle parsing to base units.
${usageInstructions}
`;
};

const transferStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    senderId: z.string().describe('The Hedera account ID sending the tokens (e.g., "0.0.789012")'),
    receiverId: z.string().describe('The Hedera account ID receiving the tokens (e.g., "0.0.345678")'),
    amount: z
      .string()
      .describe('The amount of tokens to transfer in display units (human-readable, e.g. "100.5")'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully transferred tokens for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class TransferStablecoinTool extends BaseTool {
  method = TRANSFER_STABLECOIN_TOOL;
  name = 'Transfer Stablecoin';
  description: string;
  parameters: ReturnType<typeof transferStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = transferStablecoinPrompt(context);
    this.parameters = transferStablecoinParameters(context);
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

    const info = await StableCoin.getInfo(new GetStableCoinDetailsRequest({ id: params.tokenId }));
    const decimals = info.decimals || 0;
    const amountBase = toBaseUnit(params.amount, decimals).toString();

    return new TransfersRequest({
      tokenId: params.tokenId,
      targetId: params.senderId,
      targetsId: [params.receiverId],
      amounts: [amountBase],
    });
  }

  async coreAction(request: TransfersRequest, _context: Context, _client: Client) {
    const response = await StableCoin.buildTransfers(request);
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
    const desc = 'Failed to transfer stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new TransferStablecoinTool(context, config);

export default tool;
