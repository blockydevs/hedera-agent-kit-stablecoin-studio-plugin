import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode, Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, UpdateRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/stablecoin-output-parser';

export const UPDATE_STABLECOIN_TOOL = 'update_stablecoin_tool';

const updateStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool updates the metadata of an existing stablecoin on the Hedera network. Only the admin key holder can update a stablecoin.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to update (e.g., "0.0.123456").
- name (str, optional): New name for the stablecoin.
- symbol (str, optional): New symbol for the stablecoin.
- memo (str, optional): New memo for the stablecoin (max 100 characters).
${usageInstructions}
`;
};

const updateStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    name: z.string().optional().describe('New name for the stablecoin'),
    symbol: z.string().optional().describe('New symbol for the stablecoin'),
    memo: z.string().max(100).optional().describe('New memo (max 100 characters)'),
  });

const updateStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof updateStablecoinParameters>>,
  config: StablecoinStudioPluginConfig,
) => {
  try {
    if (context.mode !== AgentMode.RETURN_BYTES && !config.privateKey) {
      throw new Error(
        'privateKey is required in plugin config for AUTONOMOUS mode. Provide it via createStablecoinStudioPlugin({ privateKey: "..." }).',
      );
    }

    const network = resolveNetwork(client, config);
    await initSdk(network, config);
    await connectSdk(network, config, context);

    const requestConfig: any = { tokenId: params.tokenId };
    if (params.name !== undefined) requestConfig.name = params.name;
    if (params.symbol !== undefined) requestConfig.symbol = params.symbol;
    if (params.memo !== undefined) requestConfig.memo = params.memo;

    const request = new UpdateRequest(requestConfig);
    const response = await StableCoin.update(request);

    return {
      raw: response,
      humanMessage: `Stablecoin ${params.tokenId} updated successfully.`,
    };
  } catch (error) {
    const desc = 'Failed to update stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: UPDATE_STABLECOIN_TOOL,
  name: 'Update Stablecoin',
  description: updateStablecoinPrompt(context),
  parameters: updateStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    updateStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
