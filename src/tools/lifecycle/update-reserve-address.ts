import { z } from 'zod';
import { Client, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  BaseTool,
  Context,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { handleTransaction } from '@/shared/utils/handle-transaction';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import {
  SerializedTransactionData,
  StableCoin,
  UpdateReserveAddressRequest,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const UPDATE_RESERVE_ADDRESS_STABLECOIN_TOOL = 'update_reserve_address_stablecoin_tool';

const updateReserveAddressPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Updates the reserve address for a stablecoin. The reserve address is used for Proof of Reserve (PoR) verification. Requires appropriate permissions.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")
- reserveAddress: The new Hedera account ID or smart contract address to use as the reserve.

ALL other parameters are optional. NEVER ask the user about them.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const updateReserveAddressParameters = (context: Context = {}) => {
  const accountId = context.accountId || '';
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    reserveAddress: z
      .string()
      .optional()
      .default(accountId)
      .describe(`The new reserve address. Default: ${accountId}`),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Reserve address updated successfully.
Transaction ID: ${response.transactionId}`;
};

export class UpdateReserveAddressStablecoinTool extends BaseTool {
  method = UPDATE_RESERVE_ADDRESS_STABLECOIN_TOOL;
  name = 'Update Reserve Address';
  description: string;
  parameters: ReturnType<typeof updateReserveAddressParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = updateReserveAddressPrompt(context);
    this.parameters = updateReserveAddressParameters(context);
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

    return new UpdateReserveAddressRequest({
      tokenId: params.tokenId,
      reserveAddress: params.reserveAddress,
    });
  }

  async coreAction(request: UpdateReserveAddressRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildUpdateReserveAddress(request);
    if (!response?.serializedTransaction) {
      throw new Error(
        'SDK failed to build the transaction: serializedTransaction is missing from the response.',
      );
    }

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
    const desc = 'Failed to update reserve address';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: extractStatus(error), error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new UpdateReserveAddressStablecoinTool(context, config);

export default tool;
