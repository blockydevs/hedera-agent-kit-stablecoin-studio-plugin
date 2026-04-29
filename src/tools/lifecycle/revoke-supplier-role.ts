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
  RevokeRoleRequest,
  StableCoinRole,
  SerializedTransactionData,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const REVOKE_SUPPLIER_ROLE_TOOL = 'revoke_supplier_role_tool';

const revokeSupplierRolePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool revokes the CASHIN_ROLE (minting permission) from an account for a stablecoin on the Hedera network. Requires appropriate admin permissions.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to revoke the role from (e.g., "0.0.789012").
${usageInstructions}
`;
};

const revokeSupplierRoleParameters = (context: Context = {}) => {
  const accountId = context.accountId || "";
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to revoke the role from (e.g., "0.0.789012"). Default: ${accountId}`,
      ),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Supplier role revoked successfully.
Transaction ID: ${response.transactionId}`;
};

export class RevokeSupplierRoleTool extends BaseTool {
  method = REVOKE_SUPPLIER_ROLE_TOOL;
  name = 'Revoke Supplier Role';
  description: string;
  parameters: ReturnType<typeof revokeSupplierRoleParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = revokeSupplierRolePrompt(context);
    this.parameters = revokeSupplierRoleParameters(context);
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
      role: StableCoinRole.CASHIN_ROLE,
    });
  }

  async coreAction(request: RevokeRoleRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await Role.buildRevokeRole(request);
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
    const desc = 'Failed to revoke supplier role';
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
  new RevokeSupplierRoleTool(context, config);

export default tool;
