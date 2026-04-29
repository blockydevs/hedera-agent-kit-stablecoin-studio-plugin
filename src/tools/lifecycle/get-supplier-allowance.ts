import { z } from 'zod';
import { Client } from '@hiero-ledger/sdk';
import { Context, BaseTool } from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { Role, GetSupplierAllowanceRequest, Balance, CheckSupplierLimitRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const GET_SUPPLIER_ALLOWANCE_TOOL = 'get_supplier_allowance_tool';

const getSupplierAllowancePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool retrieves the minting allowance for a specific account (supplier) for a stablecoin on the Hedera network. Result is returned in display units (human-readable).

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to check the allowance for (e.g., "0.0.789012").
${usageInstructions}
`;
};

const getSupplierAllowanceParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to check the allowance for (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
  });
};

export class GetSupplierAllowanceTool extends BaseTool {
  method = GET_SUPPLIER_ALLOWANCE_TOOL;
  name = 'Get Supplier Allowance';
  description: string;
  parameters: ReturnType<typeof getSupplierAllowanceParameters>;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = getSupplierAllowancePrompt(context);
    this.parameters = getSupplierAllowanceParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, _context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    const network = resolveNetwork(client, this.config);
    await initSdk(network, this.config);

    return new GetSupplierAllowanceRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: GetSupplierAllowanceRequest, _context: Context, _client: Client) {
    const allowance: Balance = await Role.getAllowance(request);
    const allowanceStr = allowance.value.toString();
    const allowanceRawStr = allowance.value.toBigInt().toString();

    const isUnlimited = await Role.isUnlimited(new CheckSupplierLimitRequest({
      tokenId: request.tokenId,
      targetId: request.targetId,
    }));

    const displayAllowance = isUnlimited ? 'Unlimited' : allowanceStr;

    return {
      raw: {
        accountId: request.targetId,
        tokenId: request.tokenId,
        allowance: displayAllowance,
        allowanceRaw: allowanceRawStr,
        isUnlimited,
      },
      humanMessage: `Minting allowance of token ${request.tokenId} for account ${request.targetId}: ${displayAllowance}`,
    };
  }

  async shouldSecondaryAction() {
    return false;
  }

  async secondaryAction(_request: any, _client: Client, _context: Context) {
    return null;
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to get supplier allowance';
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
  new GetSupplierAllowanceTool(context, config);

export default tool;
