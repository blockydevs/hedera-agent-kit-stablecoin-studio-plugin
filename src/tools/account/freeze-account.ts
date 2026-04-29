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
import {
  StableCoin,
  FreezeAccountRequest,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/shared/utils/stablecoin-sdk-utils';

export const FREEZE_ACCOUNT_TOOL = 'freeze_account_tool';

const freezeAccountPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool freezes a specific account for a stablecoin on the Hedera network, preventing it from transferring or receiving the token. Requires the freeze key.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to freeze (e.g., "0.0.789012").
${usageInstructions}
`;
};

const freezeAccountParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to freeze (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully froze account for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class FreezeAccountTool extends BaseTool {
  method = FREEZE_ACCOUNT_TOOL;
  name = 'Freeze Account';
  description: string;
  parameters: ReturnType<typeof freezeAccountParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = freezeAccountPrompt(context);
    this.parameters = freezeAccountParameters(context);
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

    return new FreezeAccountRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: FreezeAccountRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildFreeze(request);
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
    const desc = 'Failed to freeze account';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new FreezeAccountTool(context, config);

export default tool;
