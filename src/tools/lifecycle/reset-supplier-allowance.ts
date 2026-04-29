import { z } from 'zod';
import { Client, Transaction } from '@hiero-ledger/sdk';
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
  Role,
  ResetSupplierAllowanceRequest,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const RESET_SUPPLIER_ALLOWANCE_TOOL = 'reset_supplier_allowance_tool';

const resetSupplierAllowancePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool resets the minting allowance for a specific account (supplier) to zero for a stablecoin on the Hedera network. Requires appropriate admin permissions.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to reset the allowance for (e.g., "0.0.789012").
- startDate (str, optional): ISO 8601 date for scheduling the operation.
${usageInstructions}
`;
};

const resetSupplierAllowanceParameters = (context: Context = {}) => {
  const accountId = context.accountId || "";
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to reset the allowance for (e.g., "0.0.789012"). Default: ${accountId}`,
      ),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Supplier allowance reset successfully.
Transaction ID: ${response.transactionId}`;
};

export class ResetSupplierAllowanceTool extends BaseTool {
  method = RESET_SUPPLIER_ALLOWANCE_TOOL;
  name = 'Reset Supplier Allowance';
  description: string;
  parameters: ReturnType<typeof resetSupplierAllowanceParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = resetSupplierAllowancePrompt(context);
    this.parameters = resetSupplierAllowanceParameters(context);
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

    return new ResetSupplierAllowanceRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      startDate: params.startDate,
    });
  }

  async coreAction(request: ResetSupplierAllowanceRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await Role.buildResetAllowance(request);
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
    const desc = 'Failed to reset supplier allowance';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: {
        status: extractStatus(error),
        error: message,
      },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new ResetSupplierAllowanceTool(context, config);

export default tool;
