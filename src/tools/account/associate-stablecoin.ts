import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode, Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, AssociateTokenRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/stablecoin-output-parser';

export const ASSOCIATE_STABLECOIN_TOOL = 'associate_stablecoin_tool';

const associateStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool associates a stablecoin token with a Hedera account. An account must be associated with a token before it can hold or receive that token.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to associate with the token (e.g., "0.0.789012").
${usageInstructions}
`;
};

const associateStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .describe('The Hedera account ID to associate with the token (e.g., "0.0.789012")'),
  });

const associateStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof associateStablecoinParameters>>,
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

    const request = new AssociateTokenRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
    const response = await StableCoin.associate(request);

    return {
      raw: response,
      humanMessage: `Successfully associated token ${params.tokenId} with account ${params.targetId}.`,
    };
  } catch (error) {
    const desc = 'Failed to associate stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: ASSOCIATE_STABLECOIN_TOOL,
  name: 'Associate Stablecoin',
  description: associateStablecoinPrompt(context),
  parameters: associateStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    associateStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
