import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode, Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, WipeRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/stablecoin-output-parser';

export const WIPE_STABLECOIN_TOOL = 'wipe_stablecoin_tool';

const wipeStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool wipes (removes) a specified amount of stablecoin tokens from a target account. This is an admin operation that requires the wipe role.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to wipe tokens from (e.g., "0.0.789012").
- amount (str, required): The amount of tokens to wipe (e.g., "1000").
- startDate (str, optional): ISO 8601 date for scheduling the operation.
${usageInstructions}
`;
};

const wipeStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z.string().describe('The Hedera account ID to wipe tokens from (e.g., "0.0.789012")'),
    amount: z.string().describe('The amount of tokens to wipe (e.g., "1000")'),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });

const wipeStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof wipeStablecoinParameters>>,
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

    const request = new WipeRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      amount: params.amount,
      startDate: params.startDate,
    });
    const response = await StableCoin.wipe(request);

    return {
      raw: response,
      humanMessage: `Successfully wiped ${params.amount} tokens of ${params.tokenId} from ${params.targetId}.`,
    };
  } catch (error) {
    const desc = 'Failed to wipe stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: WIPE_STABLECOIN_TOOL,
  name: 'Wipe Stablecoin',
  description: wipeStablecoinPrompt(context),
  parameters: wipeStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    wipeStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
