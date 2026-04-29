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
  IncreaseSupplierAllowanceRequest,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const INCREASE_SUPPLIER_ALLOWANCE_TOOL = 'increase_supplier_allowance_tool';

const increaseSupplierAllowancePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Increases the minting allowance for a specific account (supplier) for a stablecoin. Requires appropriate admin permissions.

MANDATORY: Show a complete execution plan and wait for explicit user approval ("yes", "confirm", "proceed") BEFORE calling this tool. NEVER call this tool without approval, UNLESS the user has already provided explicit confirmation in the current request (e.g., "proceed immediately").

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")
- amount: The amount to add to the supplier's current minting allowance (e.g., "100.5")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- targetId: Defaults to the user account in context.
- startDate: null (execution is immediate)
- amount is in display units (human-readable), the tool will handle parsing to base units.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const increaseSupplierAllowanceParameters = (context: Context = {}) => {
  const accountId = context.accountId || "";
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to increase the allowance for (e.g., "0.0.789012"). Default: ${accountId}`,
      ),
    amount: z
      .string()
      .describe('The amount to add to the minting allowance in display units (e.g., "100.5")'),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Supplier allowance increased successfully.
Transaction ID: ${response.transactionId}`;
};

export class IncreaseSupplierAllowanceTool extends BaseTool {
  method = INCREASE_SUPPLIER_ALLOWANCE_TOOL;
  name = 'Increase Supplier Allowance';
  description: string;
  parameters: ReturnType<typeof increaseSupplierAllowanceParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = increaseSupplierAllowancePrompt(context);
    this.parameters = increaseSupplierAllowanceParameters(context);
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

    return new IncreaseSupplierAllowanceRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      amount: params.amount,
      startDate: params.startDate,
    });
  }

  async coreAction(request: IncreaseSupplierAllowanceRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await Role.buildIncreaseAllowance(request);
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
    const desc = 'Failed to increase supplier allowance';
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
  new IncreaseSupplierAllowanceTool(context, config);

export default tool;
