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

export const PAUSE_STABLECOIN_TOOL = 'pause_stablecoin_tool';

const pauseStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool pauses a stablecoin on the Hedera network, preventing all token transfers while preserving balances and ownership. Requires the pause key.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to pause (e.g., "0.0.123456").
${usageInstructions}
`;
};

const pauseStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
  });

const pauseStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof pauseStablecoinParameters>>,
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
    const response = await StableCoin.pause(request);

    return {
      raw: response,
      humanMessage: `Stablecoin ${params.tokenId} paused successfully.`,
    };
  } catch (error) {
    const desc = 'Failed to pause stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: PAUSE_STABLECOIN_TOOL,
  name: 'Pause Stablecoin',
  description: pauseStablecoinPrompt(context),
  parameters: pauseStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    pauseStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
