import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode, Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, RescueHBARRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/stablecoin-output-parser';

export const RESCUE_HBAR_STABLECOIN_TOOL = 'rescue_hbar_stablecoin_tool';

const rescueHbarStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool rescues (recovers) HBAR from the stablecoin's smart contract treasury. Requires the rescue role.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- amount (str, required): The amount of HBAR to rescue (e.g., "10").
- startDate (str, optional): ISO 8601 date for scheduling the operation.
${usageInstructions}
`;
};

const rescueHbarStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    amount: z.string().describe('The amount of HBAR to rescue (e.g., "10")'),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });

const rescueHbarStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof rescueHbarStablecoinParameters>>,
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

    const request = new RescueHBARRequest({
      tokenId: params.tokenId,
      amount: params.amount,
      startDate: params.startDate,
    });
    const response = await StableCoin.rescueHBAR(request);

    return {
      raw: response,
      humanMessage: `Successfully rescued ${params.amount} HBAR from stablecoin ${params.tokenId}.`,
    };
  } catch (error) {
    const desc = 'Failed to rescue HBAR from stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: RESCUE_HBAR_STABLECOIN_TOOL,
  name: 'Rescue HBAR Stablecoin',
  description: rescueHbarStablecoinPrompt(context),
  parameters: rescueHbarStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    rescueHbarStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
