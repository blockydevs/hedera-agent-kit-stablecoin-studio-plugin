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
import {
  StableCoin,
  ExecuteHoldRequest,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
  hexToUint8Array,
} from '@/stablecoin-sdk-utils';

export const EXECUTE_HOLD_STABLECOIN_TOOL = 'execute_hold_stablecoin_tool';

const executeHoldPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool executes a previously created token hold for a stablecoin on the Hedera network. This results in the tokens being transferred from the source account to the target account. Requires the escrow role for that hold. Amounts are in display units (human-readable).

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- holdId (number, required): The ID of the hold to execute (e.g., 123).
- amount (str, required): The amount of tokens to execute in display units (e.g., "50.5"). The tool will handle parsing to base units.
- sourceId (str, required): The account ID from which the tokens were held (origin).
- targetId (str, optional): The account ID to receive the tokens. Defaults to escrow.
${usageInstructions}
`;
};

const executeHoldParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    holdId: z.number().int().describe('The ID of the hold to execute'),
    amount: z
      .string()
      .describe('The amount of tokens to execute in display units (human-readable, e.g. "50.5")'),
    sourceId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The source account ID (origin of the hold). Default: ${accountId || 'operator account'}`,
      ),
    targetId: z.string().optional().describe('The destination account ID to receive tokens'),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully executed hold for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class ExecuteHoldStablecoinTool extends BaseTool {
  method = EXECUTE_HOLD_STABLECOIN_TOOL;
  name = 'Execute Hold';
  description: string;
  parameters: ReturnType<typeof executeHoldParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = executeHoldPrompt(context);
    this.parameters = executeHoldParameters(context);
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

    return new ExecuteHoldRequest({
      tokenId: params.tokenId,
      holdId: params.holdId,
      amount: params.amount,
      sourceId: params.sourceId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: ExecuteHoldRequest, _context: Context, _client: Client) {
    const response = await StableCoin.buildExecuteHold(request);
    const bytes = hexToUint8Array(response.serializedTransaction);
    return Transaction.fromBytes(bytes);
  }

  async shouldSecondaryAction() {
    return true;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    if (context.mode === AgentMode.RETURN_BYTES) {
      return {
        raw: transaction,
        humanMessage: 'Transaction ready for signing.',
      };
    }
    return await handleTransaction(transaction, client, context, postProcess);
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to execute hold';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new ExecuteHoldStablecoinTool(context, config);

export default tool;
