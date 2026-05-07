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
  GrantRoleRequest,
  StableCoinRole,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const GRANT_ROLE_STABLECOIN_TOOL = 'grant_role_stablecoin_tool';

const roles = [
  'CASHIN_ROLE',
  'BURN_ROLE',
  'WIPE_ROLE',
  'RESCUE_ROLE',
  'PAUSE_ROLE',
  'FREEZE_ROLE',
  'DELETE_ROLE',
  'DEFAULT_ADMIN_ROLE',
  'KYC_ROLE',
  'CUSTOM_FEES_ROLE',
  'HOLD_CREATOR_ROLE',
] as const;

const grantRolePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Grants a specific role (permission) to an account for a stablecoin. Requires the admin role.

Roles:
- CASHIN_ROLE: Allows minting new tokens.
- BURN_ROLE: Allows destroying tokens from treasury.
- WIPE_ROLE: Allows removing tokens from accounts.
- RESCUE_ROLE: Allows recovering assets from contract.
- PAUSE_ROLE: Allows halting token operations.
- FREEZE_ROLE: Allows freezing/unfreezing accounts.
- DELETE_ROLE: Allows deleting the stablecoin.
- DEFAULT_ADMIN_ROLE: Master administrator.
- KYC_ROLE: Allows granting/revoking KYC.
- CUSTOM_FEES_ROLE: Allows managing custom fees.
- HOLD_CREATOR_ROLE: Allows creating token holds.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")
- role: The role to grant (e.g., "BURN_ROLE")

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

const grantRoleParameters = (context: Context = {}) => {
  const accountId = context.accountId || '';
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID or Public Key to receive the role (e.g., "0.0.789012" or hex key). Default: ${accountId}`,
      ),
    role: z.enum(roles).describe('The role to grant'),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Role granted successfully.
Transaction ID: ${response.transactionId}`;
};

export class GrantRoleStablecoinTool extends BaseTool {
  method = GRANT_ROLE_STABLECOIN_TOOL;
  name = 'Grant Role';
  description: string;
  parameters: ReturnType<typeof grantRoleParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = grantRolePrompt(context);
    this.parameters = grantRoleParameters(context);
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

    return new GrantRoleRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      role: (StableCoinRole as any)[params.role],
    });
  }

  async coreAction(request: GrantRoleRequest, _context: Context, _client: Client): Promise<any> {
    const response: SerializedTransactionData = await Role.buildGrantRole(request);
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
    const desc = 'Failed to grant role';
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
  new GrantRoleStablecoinTool(context, config);

export default tool;
