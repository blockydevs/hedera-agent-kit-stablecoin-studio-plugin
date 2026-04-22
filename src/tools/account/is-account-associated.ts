import { z } from 'zod';
import { Client, Status } from '@hiero-ledger/sdk';
import { Context, BaseTool } from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { StableCoin, IsAccountAssociatedTokenRequest } from '@hashgraph/stablecoin-npm-sdk';
import { initSdk, resolveNetwork, StablecoinStudioPluginConfig } from '@/stablecoin-sdk-utils';

export const IS_ACCOUNT_ASSOCIATED_TOOL = 'is_account_associated_tool';

const isAccountAssociatedPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool checks whether a Hedera account is associated with a specific stablecoin token.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, optional): The Hedera account ID to check association for (e.g., "0.0.789012").
${usageInstructions}
`;
};

const isAccountAssociatedParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to check (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
  });
};

export class IsAccountAssociatedTool extends BaseTool {
  method = IS_ACCOUNT_ASSOCIATED_TOOL;
  name = 'Is Account Associated';
  description: string;
  parameters: ReturnType<typeof isAccountAssociatedParameters>;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = isAccountAssociatedPrompt(context);
    this.parameters = isAccountAssociatedParameters(context);
    this.config = config;
  }

  async normalizeParams(
    inputParams: any,
    _context: Context,
    client: Client,
  ) {
    const params = this.parameters.parse(inputParams);

    const network = resolveNetwork(client, this.config);
    await initSdk(network, this.config);

    return new IsAccountAssociatedTokenRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: IsAccountAssociatedTokenRequest, _context: Context, _client: Client) {
    const associated = await StableCoin.isAccountAssociated(request);
    return {
      raw: { tokenId: request.tokenId, targetId: request.targetId, isAssociated: associated },
      humanMessage: `Account ${request.targetId} is ${associated ? '' : 'not '}associated with token ${request.tokenId}.`,
    };
  }

  async shouldSecondaryAction() {
    return false;
  }

  async secondaryAction(request: any, _client: Client, _context: Context) {
    return request;
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to check stablecoin association';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool => new IsAccountAssociatedTool(context, config);

export default tool;
