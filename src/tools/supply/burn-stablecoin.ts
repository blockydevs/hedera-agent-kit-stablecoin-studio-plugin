import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode, Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, BurnRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/stablecoin-output-parser';

export const BURN_STABLECOIN_TOOL = 'burn_stablecoin_tool';

const burnStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool burns (destroys) a specified amount of stablecoin tokens from the treasury account. Requires the burn role.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- amount (str, required): The amount of tokens to burn (e.g., "1000").
- startDate (str, optional): ISO 8601 date for scheduling the operation.
${usageInstructions}
`;
};

const burnStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    amount: z.string().describe('The amount of tokens to burn (e.g., "1000")'),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });

const burnStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof burnStablecoinParameters>>,
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

    const request = new BurnRequest({
      tokenId: params.tokenId,
      amount: params.amount,
      startDate: params.startDate,
    });
    const response = await StableCoin.burn(request);

    return {
      raw: response,
      humanMessage: `Successfully burned ${params.amount} tokens of ${params.tokenId}.`,
    };
  } catch (error) {
    const desc = 'Failed to burn stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: BURN_STABLECOIN_TOOL,
  name: 'Burn Stablecoin',
  description: burnStablecoinPrompt(context),
  parameters: burnStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    burnStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
