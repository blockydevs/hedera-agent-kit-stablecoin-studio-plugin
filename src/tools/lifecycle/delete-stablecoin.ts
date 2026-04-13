import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode, Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, DeleteRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/stablecoin-output-parser';

export const DELETE_STABLECOIN_TOOL = 'delete_stablecoin_tool';

const deleteStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool permanently deletes a stablecoin on the Hedera network. This action is irreversible. Deletion requires zero balances, an empty treasury, and DELETE role permissions.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to delete (e.g., "0.0.123456").
${usageInstructions}
`;
};

const deleteStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
  });

const deleteStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof deleteStablecoinParameters>>,
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

    const request = new DeleteRequest({ tokenId: params.tokenId });
    const response = await StableCoin.delete(request);

    return {
      raw: response,
      humanMessage: `Stablecoin ${params.tokenId} deleted successfully. This action is irreversible.`,
    };
  } catch (error) {
    const desc = 'Failed to delete stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: DELETE_STABLECOIN_TOOL,
  name: 'Delete Stablecoin',
  description: deleteStablecoinPrompt(context),
  parameters: deleteStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    deleteStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
