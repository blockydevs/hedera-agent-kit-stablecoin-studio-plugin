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
  AssociateTokenRequest,
  IsAccountAssociatedTokenRequest,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/shared/utils/stablecoin-sdk-utils';

export const ASSOCIATE_STABLECOIN_TOOL = 'associate_stablecoin_tool';

const associateStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Associates a stablecoin token with a Hedera account. An account must be associated before it can hold or receive that token.

MANDATORY: Show a complete execution plan and wait for explicit user approval ("yes", "confirm", "proceed") BEFORE calling this tool. NEVER call this tool without approval, UNLESS the user has already provided explicit confirmation in the current request (e.g., "proceed immediately").

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- targetId: Defaults to the user account in context.

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const associateStablecoinParameters = (context: Context = {}) => {
  const accountId = context.accountId || "";
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to associate with the token (e.g., "0.0.789012"). Default: ${accountId}`,
      ),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully associated account with stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class AssociateStablecoinTool extends BaseTool {
  method = ASSOCIATE_STABLECOIN_TOOL;
  name = 'Associate Stablecoin';
  description: string;
  parameters: ReturnType<typeof associateStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = associateStablecoinPrompt(context);
    this.parameters = associateStablecoinParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    if (context.mode !== AgentMode.RETURN_BYTES && !this.config.privateKey) {
      throw new Error(
        'privateKey is required in plugin config for AUTONOMOUS mode. Provide it via createStablecoinStudioPlugin({ privateKey: "..." }).',
      );
    }

    // In autonomous mode, the agent can only associate itself.
    if (context.mode === AgentMode.AUTONOMOUS && params.targetId !== this.config.accountId) {
      throw new Error(
        `Agent (account ${this.config.accountId}) cannot autonomously associate another account (${params.targetId}) with a token. The target account must associate itself or use RETURN_BYTES mode.`,
      );
    }

    await ensureSdkConnected(client, this.config, context);

    const isAssociated = await StableCoin.isAccountAssociated(
      new IsAccountAssociatedTokenRequest({
        targetId: params.targetId,
        tokenId: params.tokenId,
      }),
    );

    if (isAssociated) {
      throw new Error(`Token ${params.tokenId} is already associated with account ${params.targetId}`);
    }

    return new AssociateTokenRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: AssociateTokenRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildAssociate(request);
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
    const desc = 'Failed to associate stablecoin';
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('already associated')) {
      return {
        raw: { status: Status.Success },
        humanMessage: `Account is already associated with token.`,
      };
    }

    const fullMessage = `${desc}: ${message}`;
    return {
      raw: { status: Status.InvalidTransaction, error: fullMessage },
      humanMessage: fullMessage,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new AssociateStablecoinTool(context, config);

export default tool;
