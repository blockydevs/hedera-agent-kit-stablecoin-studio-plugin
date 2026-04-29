import { z } from 'zod';
import { Client, Status } from '@hiero-ledger/sdk';
import { Context, BaseTool } from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { StableCoin, GetAccountBalanceRequest, Balance } from '@hashgraph/stablecoin-npm-sdk';
import { initSdk, resolveNetwork, StablecoinStudioPluginConfig } from '@/shared/utils/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/shared/utils/stablecoin-output-parser';


export const GET_STABLECOIN_BALANCE_TOOL = 'get_stablecoin_balance_tool';

const getStablecoinBalancePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Returns the balance of a stablecoin for a specific account. Result is in display units (human-readable).

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- targetId: Defaults to the user account in context.

IMPORTANT: When reporting the balance, do NOT add thousand separators (commas). For example, say "1000" instead of "1,000".

${usageInstructions}
`;
};

const getStablecoinBalanceParameters = (context: Context = {}) => {
  const accountId = context.accountId || "";
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to check the balance for (e.g., "0.0.789012"). Default: ${accountId}`,
      ),
  });
};

export class GetStablecoinBalanceTool extends BaseTool {
  method = GET_STABLECOIN_BALANCE_TOOL;
  name = 'Get Stablecoin Balance';
  description: string;
  parameters: ReturnType<typeof getStablecoinBalanceParameters>;
  outputParser = stablecoinOutputParser;


  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = getStablecoinBalancePrompt(context);
    this.parameters = getStablecoinBalanceParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, _context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    const network = resolveNetwork(client, this.config);
    await initSdk(network, this.config);

    return new GetAccountBalanceRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: GetAccountBalanceRequest, _context: Context, _client: Client) {
    const balance: Balance = await StableCoin.getBalanceOf(request);
    const balanceStr = balance.value.toString();
    const balanceRawStr = balance.value.toBigInt().toString();

    return {
      raw: {
        accountId: request.targetId,
        tokenId: request.tokenId,
        balance: balanceStr,
        balanceRaw: balanceRawStr,
      },
      humanMessage: `Balance of token ${request.tokenId} for account ${request.targetId}: ${balanceStr}`,
    };
  }

  async shouldSecondaryAction() {
    return false;
  }

  async secondaryAction(request: any, _client: Client, _context: Context) {
    return request;
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to get stablecoin balance';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new GetStablecoinBalanceTool(context, config);

export default tool;
