import { z } from 'zod';
import { Client, Status } from '@hiero-ledger/sdk';
import { Context, BaseTool, PromptGenerator } from '@hashgraph/hedera-agent-kit';
import { StableCoin, GetStableCoinDetailsRequest } from '@hashgraph/stablecoin-npm-sdk';
import { initSdk, resolveNetwork, StablecoinStudioPluginConfig } from '@/stablecoin-sdk-utils';

export const GET_STABLECOIN_INFO_TOOL = 'get_stablecoin_info_tool';

const getStablecoinInfoPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool returns detailed information about a stablecoin managed by Stablecoin Studio on the Hedera network.
Supply values are returned in display units (human-readable).

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

export class GetStablecoinInfoTool extends BaseTool {
  method = GET_STABLECOIN_INFO_TOOL;
  name = 'Get Stablecoin Info';
  description: string;
  parameters: ReturnType<typeof getStablecoinInfoParameters>;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = getStablecoinInfoPrompt(context);
    this.parameters = getStablecoinInfoParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, _context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    const network = resolveNetwork(client, this.config);
    await initSdk(network, this.config);

    return new GetStableCoinDetailsRequest({ id: params.tokenId });
  }

  async coreAction(request: GetStableCoinDetailsRequest, _context: Context, _client: Client) {
    const details = await StableCoin.getInfo(request);
    return {
      raw: { tokenId: request.id, details },
      humanMessage: postProcess(details),
    };
  }

  async shouldSecondaryAction() {
    return false;
  }

  async secondaryAction(request: any, _client: Client, _context: Context) {
    return request;
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to get stablecoin info';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new GetStablecoinInfoTool(context, config);

export default tool;
