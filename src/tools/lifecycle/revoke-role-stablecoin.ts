import { z } from 'zod';
import { Client, Status, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  Context,
  BaseTool,
  PromptGenerator,
  handleTransaction,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { Role, RevokeRoleRequest, StableCoinRole } from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const REVOKE_ROLE_STABLECOIN_TOOL = 'revoke_role_stablecoin_tool';

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

const revokeRolePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool revokes a specific role (permission) from an account for a stablecoin on the Hedera network. Requires the admin role.

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

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to revoke the role from (e.g., "0.0.789012").
- role (str, required): The role to revoke (from the list above).
${usageInstructions}
`;
};

const revokeRoleParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z.string().describe('The Hedera account ID to revoke the role from (e.g., "0.0.789012")'),
    role: z.enum(roles).describe('The role to revoke'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully revoked role from account for stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class RevokeRoleStablecoinTool extends BaseTool {
  method = REVOKE_ROLE_STABLECOIN_TOOL;
  name = 'Revoke Role';
  description: string;
  parameters: ReturnType<typeof revokeRoleParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = revokeRolePrompt(context);
    this.parameters = revokeRoleParameters(context);
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

    return new RevokeRoleRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      role: (StableCoinRole as any)[params.role],
    });
  }

  async coreAction(request: RevokeRoleRequest, _context: Context, _client: Client): Promise<any> {
    const response = await Role.buildRevokeRole(request);
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
    const desc = 'Failed to revoke role';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new RevokeRoleStablecoinTool(context, config);

export default tool;
