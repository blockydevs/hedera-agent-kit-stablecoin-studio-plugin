import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode, Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, PauseRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/stablecoin-output-parser';

export const UNPAUSE_STABLECOIN_TOOL = 'unpause_stablecoin_tool';

const unpauseStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool unpauses a stablecoin on the Hedera network, re-enabling all token operations that were halted by a previous pause. Requires the pause key.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to unpause (e.g., "0.0.123456").
${usageInstructions}
`;
};

const unpauseStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
  });

const unpauseStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof unpauseStablecoinParameters>>,
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

    const request = new PauseRequest({ tokenId: params.tokenId });
    const response = await StableCoin.unPause(request);

    return {
      raw: response,
      humanMessage: `Stablecoin ${params.tokenId} unpaused successfully.`,
    };
  } catch (error) {
    const desc = 'Failed to unpause stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: UNPAUSE_STABLECOIN_TOOL,
  name: 'Unpause Stablecoin',
  description: unpauseStablecoinPrompt(context),
  parameters: unpauseStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    unpauseStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
