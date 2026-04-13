import { z } from 'zod';
import { Client, Status } from '@hashgraph/sdk';
import { Context, Tool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, GetStableCoinDetailsRequest } from '@hashgraph/stablecoin-npm-sdk';
import { initSdk, resolveNetwork, StablecoinStudioPluginConfig } from '@/stablecoin-sdk-utils';

export const GET_STABLECOIN_INFO_TOOL = 'get_stablecoin_info_tool';

const getStablecoinInfoPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool returns detailed information about a stablecoin managed by Stablecoin Studio on the Hedera network.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin to query (e.g., "0.0.123456").
${usageInstructions}
`;
};

const getStablecoinInfoParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
  });

const postProcess = (details: any) => {
  const formatKey = (key: string | null) => key ?? 'Not Set';

  return `Stablecoin details for **${details.tokenId}**:

- **Name**: ${details.name}
- **Symbol**: ${details.symbol}
- **Decimals**: ${details.decimals}
- **Total Supply**: ${details.totalSupply}
- **Max Supply**: ${details.maxSupply}
- **Treasury**: ${details.treasury}
- **Proxy Address**: ${details.proxyAddress}
- **Supply Type**: ${details.supplyType}
- **Paused**: ${details.paused}
- **Deleted**: ${details.deleted}

**Keys**:
- Admin Key: ${formatKey(details.adminKey)}
- Supply Key: ${formatKey(details.supplyKey)}
- Wipe Key: ${formatKey(details.wipeKey)}
- KYC Key: ${formatKey(details.kycKey)}
- Freeze Key: ${formatKey(details.freezeKey)}
- Pause Key: ${formatKey(details.pauseKey)}
- Fee Schedule Key: ${formatKey(details.feeScheduleKey)}

${details.memo ? `**Memo**: ${details.memo}` : ''}`;
};

const getStablecoinInfo = async (
  client: Client,
  _context: Context,
  params: z.infer<ReturnType<typeof getStablecoinInfoParameters>>,
  config: StablecoinStudioPluginConfig,
) => {
  try {
    const network = resolveNetwork(client, config);
    await initSdk(network, config);

    const request = new GetStableCoinDetailsRequest({ id: params.tokenId });
    const details = await StableCoin.getInfo(request);

    return {
      raw: { tokenId: params.tokenId, details },
      humanMessage: postProcess(details),
    };
  } catch (error) {
    const desc = 'Failed to get stablecoin info';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
};

const tool = (context: Context, config: StablecoinStudioPluginConfig): Tool => ({
  method: GET_STABLECOIN_INFO_TOOL,
  name: 'Get Stablecoin Info',
  description: getStablecoinInfoPrompt(context),
  parameters: getStablecoinInfoParameters(context),
  execute: (client: Client, ctx: Context, params: any) =>
    getStablecoinInfo(client, ctx, params, config),
});

export default tool;
