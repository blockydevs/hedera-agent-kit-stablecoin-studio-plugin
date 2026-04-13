import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { AgentMode, Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, CashInRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/stablecoin-output-parser';

export const CASH_IN_STABLECOIN_TOOL = 'cash_in_stablecoin_tool';

const cashInStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool mints (cash-in) new stablecoin tokens to a target account on the Hedera network. Requires the cash-in role.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, required): The Hedera account ID to receive the minted tokens (e.g., "0.0.789012").
- amount (str, required): The amount of tokens to mint (e.g., "1000").
- startDate (str, optional): ISO 8601 date for scheduling the operation.
${usageInstructions}
`;
};

const cashInStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .describe('The Hedera account ID to receive the minted tokens (e.g., "0.0.789012")'),
    amount: z.string().describe('The amount of tokens to mint (e.g., "1000")'),
    startDate: z.string().optional().describe('ISO 8601 date for scheduling the operation'),
  });

const cashInStablecoin = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof cashInStablecoinParameters>>,
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

    const request = new CashInRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
      amount: params.amount,
      startDate: params.startDate,
    });
    const response = await StableCoin.cashIn(request);

    return {
      raw: response,
      humanMessage: `Successfully minted ${params.amount} tokens of ${params.tokenId} to ${params.targetId}.`,
    };
  } catch (error) {
    const desc = 'Failed to cash in (mint) stablecoin';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: CASH_IN_STABLECOIN_TOOL,
  name: 'Cash In Stablecoin',
  description: cashInStablecoinPrompt(context),
  parameters: cashInStablecoinParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    cashInStablecoin(client, ctx, params, config),
  outputParser: stablecoinOutputParser,
});

export default tool;
