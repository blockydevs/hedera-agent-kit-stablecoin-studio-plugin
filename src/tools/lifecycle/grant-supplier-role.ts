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

export const GRANT_SUPPLIER_ROLE_TOOL = 'grant_supplier_role_tool';

const grantSupplierRolePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool grants the CASHIN_ROLE (minting permission) to an account for a stablecoin on the Hedera network, along with an initial minting allowance. Requires appropriate admin permissions.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to receive the role (e.g., "0.0.789012").
- amount (str, optional): The initial minting allowance in display units (e.g., "100.5"). If not provided or set to "0", it defaults to unlimited.
${usageInstructions}
`;
};

const grantSupplierRoleParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to receive the role (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
    amount: z
      .string()
      .optional()
      .describe(
        'The initial minting allowance in display units (e.g., "100.5").',
      ),
  });
};

const postProcess = (response: RawTransactionResponse) => {
  return `Supplier role granted successfully.
Transaction ID: ${response.transactionId}`;
};

export class GrantSupplierRoleTool extends BaseTool {
  method = GRANT_SUPPLIER_ROLE_TOOL;
  name = 'Grant Supplier Role';
  description: string;
  parameters: ReturnType<typeof grantSupplierRoleParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = grantSupplierRolePrompt(context);
    this.parameters = grantSupplierRoleParameters(context);
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

    const isUnlimited = !params.amount || params.amount === '0';

    return new GrantRoleRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      role: StableCoinRole.CASHIN_ROLE,
      amount: isUnlimited ? undefined : params.amount,
      supplierType: isUnlimited ? 'unlimited' : 'limited', // there is no enum in sdk for this
    });
  }

  async coreAction(request: GrantRoleRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await Role.buildGrantRole(request);
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
    const desc = 'Failed to grant supplier role';
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
  new GrantSupplierRoleTool(context, config);

export default tool;
