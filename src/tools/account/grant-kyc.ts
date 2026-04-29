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
import { StableCoin, KYCRequest, SerializedTransactionData } from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/shared/utils/stablecoin-sdk-utils';

export const GRANT_KYC_TOOL = 'grant_kyc_tool';

const grantKycPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Grants KYC (Know Your Customer) status to a specific account for a stablecoin. This allows the account to hold and transfer the token. Requires the kyc role.

MANDATORY: Show a complete execution plan and wait for explicit user approval ("yes", "confirm", "proceed") BEFORE calling this tool. NEVER call this tool without approval, UNLESS the user has already provided explicit confirmation in the current request (e.g., "proceed immediately").

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")
- targetId: The Hedera account ID to grant KYC to (e.g., "0.0.789012")

ALL other parameters are optional. NEVER ask the user about them.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const grantKycParameters = (context: Context = {}) => {
  const accountId = context.accountId || "";
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to grant KYC to (e.g., "0.0.789012"). Default: ${accountId}`,
      ),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully granted KYC to account for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class GrantKycTool extends BaseTool {
  method = GRANT_KYC_TOOL;
  name = 'Grant KYC';
  description: string;
  parameters: ReturnType<typeof grantKycParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = grantKycPrompt(context);
    this.parameters = grantKycParameters(context);
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

    return new KYCRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: KYCRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildGrantKyc(request);
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
    const desc = 'Failed to grant KYC';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new GrantKycTool(context, config);

export default tool;
