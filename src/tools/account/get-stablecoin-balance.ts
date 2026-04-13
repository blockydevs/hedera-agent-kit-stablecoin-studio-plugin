import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, GetAccountBalanceRequest } from '@hashgraph/stablecoin-npm-sdk';
import { initSdk, resolveNetwork, StablecoinStudioPluginConfig } from '@/stablecoin-sdk-utils';

export const GET_STABLECOIN_BALANCE_TOOL = 'get_stablecoin_balance_tool';

const getStablecoinBalancePrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool returns the balance of a stablecoin for a specific account on the Hedera network.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to check the balance for (e.g., "0.0.789012").
${usageInstructions}
`;
};

const getStablecoinBalanceParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .describe('The Hedera account ID to check the balance for (e.g., "0.0.789012")'),
  });

const getStablecoinBalance = async (
  client: Client,
  _context: Context,
  params: z.infer<ReturnType<typeof getStablecoinBalanceParameters>>,
  config: StablecoinStudioPluginConfig,
) => {
  try {
    const network = resolveNetwork(client, config);
    await initSdk(network, config);

    const request = new GetAccountBalanceRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
    const balance = await StableCoin.getBalanceOf(request);

    return {
      raw: { tokenId: params.tokenId, targetId: params.targetId, balance },
      humanMessage: `Balance of token ${params.tokenId} for account ${params.targetId}: ${balance}`,
    };
  } catch (error) {
    const desc = 'Failed to get stablecoin balance';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: GET_STABLECOIN_BALANCE_TOOL,
  name: 'Get Stablecoin Balance',
  description: getStablecoinBalancePrompt(context),
  parameters: getStablecoinBalanceParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    getStablecoinBalance(client, ctx, params, config),
});

export default tool;
