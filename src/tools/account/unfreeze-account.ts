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
import { StableCoin, FreezeAccountRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const UNFREEZE_ACCOUNT_TOOL = 'unfreeze_account_tool';

const unfreezeAccountPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool unfreezes a previously frozen account for a stablecoin on the Hedera network, re-enabling its ability to transfer or receive the token. Requires the freeze key.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to unfreeze (e.g., "0.0.789012").
${usageInstructions}
`;
};

const unfreezeAccountParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to unfreeze (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully unfroze account for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class UnfreezeAccountTool extends BaseTool {
  method = UNFREEZE_ACCOUNT_TOOL;
  name = 'Unfreeze Account';
  description: string;
  parameters: ReturnType<typeof unfreezeAccountParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = unfreezeAccountPrompt(context);
    this.parameters = unfreezeAccountParameters(context);
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
    const response = await StableCoin.buildUnFreeze(request);
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
    const desc = 'Failed to unfreeze account';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new UnfreezeAccountTool(context, config);

export default tool;
