import { z } from 'zod';
import { Client, Status } from '@hiero-ledger/sdk';
import { Context, BaseTool } from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import {
  StableCoin,
  GetStableCoinDetailsRequest,
  StableCoinViewModel,
} from '@hashgraph/stablecoin-npm-sdk';
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

const postProcess = (details: StableCoinViewModel) => {
  const formatValue = (val: any) => val?.toString() ?? 'Not Set';
  const formatBool = (val?: boolean) => (val === undefined ? 'Unknown' : val ? 'Yes' : 'No');

  const lines = [
    `### Stablecoin Details for **${formatValue(details.tokenId)}**`,
    '',
    '#### General Information',
    `- **Name**: ${details.name ?? 'Unknown'}`,
    `- **Symbol**: ${details.symbol ?? 'Unknown'}`,
    `- **Decimals**: ${details.decimals ?? 'Unknown'}`,
    `- **Treasury**: \`${formatValue(details.treasury)}\``,
    `- **Proxy Address**: \`${formatValue(details.proxyAddress)}\``,
    `- **EVM Proxy Address**: \`${formatValue(details.evmProxyAddress)}\``,
    '',
    '#### Supply Status',
    `- **Total Supply**: ${formatValue(details.totalSupply)}`,
    `- **Max Supply**: ${details.maxSupply && details.maxSupply.toString() !== '0' ? formatValue(details.maxSupply) : 'Infinite'}`,
    `- **Initial Supply**: ${formatValue(details.initialSupply)}`,
    '',
    '#### Configuration',
    `- **Auto-Renew Account**: \`${formatValue(details.autoRenewAccount)}\``,
    `- **Auto-Renew Period**: ${details.autoRenewPeriod ? `${details.autoRenewPeriod} seconds` : 'Not Set'}`,
    `- **Expiration Time**: ${details.expirationTime ?? 'Not Set'}`,
    `- **Freeze Default**: ${formatBool(details.freezeDefault)}`,
    `- **Paused**: ${formatBool(details.paused)}`,
    `- **Deleted**: ${formatBool(details.deleted)}`,
  ];

  if (details.reserveAddress) {
    lines.push(
      '',
      '#### Proof of Reserve',
      `- **Reserve Address**: \`${formatValue(details.reserveAddress)}\``,
      `- **Reserve Amount**: ${formatValue(details.reserveAmount)}`,
    );
  }

  lines.push(
    '',
    '#### Keys',
    `- **Admin Key**: \`${formatValue(details.adminKey)}\``,
    `- **Supply Key**: \`${formatValue(details.supplyKey)}\``,
    `- **Wipe Key**: \`${formatValue(details.wipeKey)}\``,
    `- **KYC Key**: \`${formatValue(details.kycKey)}\``,
    `- **Freeze Key**: \`${formatValue(details.freezeKey)}\``,
    `- **Pause Key**: \`${formatValue(details.pauseKey)}\``,
    `- **Fee Schedule Key**: \`${formatValue(details.feeScheduleKey)}\``,
  );

  if (details.customFees && details.customFees.length > 0) {
    lines.push('', '#### Custom Fees');
    details.customFees.forEach((fee, index) => {
      lines.push(
        `${index + 1}. Collector: \`${fee.collectorId}\`, Exempt: ${fee.collectorsExempt ? 'Yes' : 'No'}, Decimals: ${fee.decimals}`,
      );
    });
  }

  if (details.metadata) {
    lines.push('', '#### Metadata', '```', details.metadata, '```');
  }

  return lines.join('\n');
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
    const details: StableCoinViewModel = await StableCoin.getInfo(request);
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
