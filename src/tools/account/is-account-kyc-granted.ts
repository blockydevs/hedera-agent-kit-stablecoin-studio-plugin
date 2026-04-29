import { z } from 'zod';
import { Client, Status } from '@hiero-ledger/sdk';
import { Context, BaseTool } from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { StableCoin, KYCRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/shared/utils/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/shared/utils/stablecoin-output-parser';


export const IS_ACCOUNT_KYC_GRANTED_TOOL = 'is_account_kyc_granted_tool';

const isAccountKycGrantedPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Checks if a specific account has been granted KYC (Know Your Customer) status for a given stablecoin.

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin (e.g., "0.0.123456")

ALL other parameters are optional. NEVER ask the user about them. Apply defaults silently:
- targetId: Defaults to the user account in context.

IMPORTANT: Do NOT use markdown formatting (like bolding or italics) for the status result. For example, say "has kyc granted" instead of "**has** kyc granted".
${usageInstructions}
`;
};

const isAccountKycGrantedParameters = (context: Context = {}) => {
  const accountId = context.accountId || "";
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to check (e.g., "0.0.789012"). Default: ${accountId}`,
      ),
  });
};

export class IsAccountKycGrantedTool extends BaseTool {
  method = IS_ACCOUNT_KYC_GRANTED_TOOL;
  name = 'Is Account KYC Granted';
  description: string;
  parameters: ReturnType<typeof isAccountKycGrantedParameters>;
  outputParser = stablecoinOutputParser;


  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = isAccountKycGrantedPrompt(context);
    this.parameters = isAccountKycGrantedParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    const network = resolveNetwork(client, this.config);
    await initSdk(network, this.config);
    await connectSdk(network, this.config, context);

    return new KYCRequest({
      tokenId: params.tokenId,
      targetId: params.targetId,
    });
  }

  async coreAction(request: KYCRequest, _context: Context, _client: Client) {
    const isGranted: boolean = await StableCoin.isAccountKYCGranted(request);
    return {
      raw: { isKycGranted: isGranted },
      humanMessage: `Account ${request.targetId} ${isGranted ? 'HAS' : 'DOES NOT HAVE'} KYC granted for stablecoin ${request.tokenId}.`,
    };
  }

  async shouldSecondaryAction() {
    return false;
  }

  async secondaryAction(request: any, _client: Client, _context: Context) {
    return request;
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to check KYC status';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new IsAccountKycGrantedTool(context, config);

export default tool;
