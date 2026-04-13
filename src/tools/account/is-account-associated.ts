import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
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
- targetId (str, required): The Hedera account ID to check association for (e.g., "0.0.789012").
${usageInstructions}
`;
};

const isAccountAssociatedParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .describe('The Hedera account ID to check association for (e.g., "0.0.789012")'),
  });

const isAccountAssociated = async (
  client: Client,
  _context: Context,
  params: z.infer<ReturnType<typeof isAccountAssociatedParameters>>,
  config: StablecoinStudioPluginConfig,
) => {
  try {
    const network = resolveNetwork(client, config);
    await initSdk(network, config);

    const request = new IsAccountAssociatedTokenRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
    const associated = await StableCoin.isAccountAssociated(request);

    return {
      raw: { tokenId: params.tokenId, targetId: params.targetId, associated },
      humanMessage: `Account ${params.targetId} is ${associated ? '' : 'not '}associated with token ${params.tokenId}.`,
    };
  } catch (error) {
    const desc = 'Failed to check stablecoin association';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: IS_ACCOUNT_ASSOCIATED_TOOL,
  name: 'Is Account Associated',
  description: isAccountAssociatedPrompt(context),
  parameters: isAccountAssociatedParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    isAccountAssociated(client, ctx, params, config),
});

export default tool;
