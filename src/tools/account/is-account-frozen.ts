import { z } from 'zod';
import { Client } from '@hiero-ledger/sdk';
import { Context, BaseTool } from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { StableCoin, FreezeAccountRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/shared/utils/stablecoin-output-parser';

export const IS_ACCOUNT_FROZEN_TOOL = 'is_account_frozen_tool';

const isAccountFrozenPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Checks if a specific account is currently frozen for a given stablecoin.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- targetId: Defaults to the user account in context.

IMPORTANT: Do NOT use markdown formatting (like bolding or italics) for the status result.

${usageInstructions}
`;
};

const isAccountFrozenParameters = (context: Context = {}) => {
  const accountId = context.accountId || '';
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(`The Hedera account ID to check (e.g., "0.0.789012"). Default: ${accountId}`),
  });
};

export class IsAccountFrozenTool extends BaseTool {
  method = IS_ACCOUNT_FROZEN_TOOL;
  name = 'Is Account Frozen';
  description: string;
  parameters: ReturnType<typeof isAccountFrozenParameters>;
  outputParser = stablecoinOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = isAccountFrozenPrompt(context);
    this.parameters = isAccountFrozenParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    const network = resolveNetwork(client, this.config);
    await initSdk(network, this.config);
    await connectSdk(network, this.config, context);

    return new FreezeAccountRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: FreezeAccountRequest, _context: Context, _client: Client) {
    const isFrozen: boolean = await StableCoin.isAccountFrozen(request);
    return {
      raw: { isFrozen },
      humanMessage: `Account ${request.targetId} is ${isFrozen ? 'FROZEN' : 'NOT frozen'} for stablecoin ${request.tokenId}.`,
    };
  }

  async shouldSecondaryAction() {
    return false;
  }

  async secondaryAction(request: any, _client: Client, _context: Context) {
    return request;
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to check freeze status';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: extractStatus(error), error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new IsAccountFrozenTool(context, config);

export default tool;
