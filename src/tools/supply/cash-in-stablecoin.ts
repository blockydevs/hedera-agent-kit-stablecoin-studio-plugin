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
import {
  StableCoin,
  CashInRequest,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const CASH_IN_STABLECOIN_TOOL = 'cash_in_stablecoin_tool';

const cashInStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool mints (cash-in) new stablecoin tokens to a target account on the Hedera network. Requires the cash-in role.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, optional): The Hedera account ID to receive the minted tokens (e.g., "0.0.789012"). If not provided, defaults to the user account in context.
- amount (str, required): The amount of tokens to mint in display units (e.g., "100.5"). The tool will handle parsing to base units.
- startDate (str, optional): ISO 8601 date for scheduling the operation.
${usageInstructions}
`;
};

const cashInStablecoinParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to receive the minted tokens (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
    amount: z
      .string()
      .describe('The amount of tokens to mint in display units (human-readable, e.g. "100.5")'),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully minted tokens for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class CashInStablecoinTool extends BaseTool {
  method = CASH_IN_STABLECOIN_TOOL;
  name = 'Cash In Stablecoin';
  description: string;
  parameters: ReturnType<typeof cashInStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = cashInStablecoinPrompt(context);
    this.parameters = cashInStablecoinParameters(context);
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

    return new CashInRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      amount: params.amount,
      startDate: params.startDate,
    });
  }

  async coreAction(request: CashInRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildCashIn(request);
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
    const desc = 'Failed to cash in (mint) stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new CashInStablecoinTool(context, config);

export default tool;
