import { z } from 'zod';
import { Client, Status, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  BaseTool,
  Context,
  handleTransaction,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { StableCoin, UpdateReserveAddressRequest } from '@hashgraph/stablecoin-npm-sdk';
import { ensureSdkConnected, hexToUint8Array, StablecoinStudioPluginConfig, } from '@/stablecoin-sdk-utils';

export const UPDATE_RESERVE_ADDRESS_STABLECOIN_TOOL = 'update_reserve_address_stablecoin_tool';

const updateReserveAddressPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool updates the reserve address for a stablecoin on the Hedera network. The reserve address is used for Proof of Reserve (PoR) verification. Requires appropriate permissions.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- reserveAddress (str, optional): The new Hedera account ID or smart contract address to use as the reserve. Defaults to the account ID in the context.
${usageInstructions}
`;
};

const updateReserveAddressParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    reserveAddress: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The new reserve address. Default: ${accountId || 'operator account'}`,
      ),
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
    const response = await StableCoin.buildUpdateReserveAddress(request);
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
    const desc = 'Failed to update reserve address';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new UpdateReserveAddressStablecoinTool(context, config);

export default tool;
