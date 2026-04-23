import { z } from 'zod';
import { Client, Status } from '@hiero-ledger/sdk';
import { Context, BaseTool } from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import { StableCoin, CapabilitiesRequest } from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
} from '@/stablecoin-sdk-utils';

export const GET_STABLECOIN_CAPABILITIES_TOOL = 'get_stablecoin_capabilities_tool';

const getStablecoinCapabilitiesPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool retrieves the capabilities and permissions of an account for a given stablecoin on the Hedera network. It shows which roles (CASHIN, BURN, WIPE, FREEZE, PAUSE, RESCUE) are assigned to the target account.

Parameters:
- tokenId (str, required): The Hedera token ID of the stablecoin (e.g., "0.0.123456").
- targetId (str, optional): The Hedera account ID to check capabilities for (e.g., "0.0.789012"). Defaults to the current session account if not provided.
${usageInstructions}
`;
};

const getStablecoinCapabilitiesParameters = (context: Context = {}) => {
  const accountId = (context as any).accountId;
  return z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    targetId: z
      .string()
      .optional()
      .default(accountId)
      .describe(
        `The Hedera account ID to check capabilities for (e.g., "0.0.789012"). Default: ${accountId || 'operator account'}`,
      ),
  });
};

export class GetStablecoinCapabilitiesTool extends BaseTool {
  method = GET_STABLECOIN_CAPABILITIES_TOOL;
  name = 'Get Stablecoin Capabilities';
  description: string;
  parameters: ReturnType<typeof getStablecoinCapabilitiesParameters>;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = getStablecoinCapabilitiesPrompt(context);
    this.parameters = getStablecoinCapabilitiesParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    const network = resolveNetwork(client, this.config);
    await initSdk(network, this.config);
    await connectSdk(network, this.config, context);

    return new CapabilitiesRequest({
      tokenId: params.tokenId,
      account: { accountId: params.targetId },
    });
  }

  async coreAction(
    request: CapabilitiesRequest,
    _context: Context,
    _client: Client,
  ): Promise<{ raw: Record<string, any>; humanMessage: string }> {
    const capabilities = await StableCoin.capabilities(request);

    // Map capabilities to boolean flags for easier matching in tests/UI
    const rawCapabilities: Record<string, boolean> = {
      canBurn: false,
      canMint: false,
      canWipe: false,
      canFreeze: false,
      canPause: false,
      canRescue: false,
      canDelete: false,
      canManageRoles: false,
    };

    const granted: string[] = [];

    capabilities.capabilities.forEach(c => {
      // In the SDK, all returned capabilities are by definition 'granted' or 'available'
      // to the account, but we should verify if the API actually implies that.
      // Based on StableCoinService.ts, listCapabilities only contains what the account CAN do.
      const op = c.operation;
      granted.push(op);

      if (op === 'Burn') rawCapabilities.canBurn = true;
      if (op === 'Cash_in') rawCapabilities.canMint = true;
      if (op === 'Wipe') rawCapabilities.canWipe = true;
      if (op === 'Freeze') rawCapabilities.canFreeze = true;
      if (op === 'Pause') rawCapabilities.canPause = true;
      if (op === 'Rescue') rawCapabilities.canRescue = true;
      if (op === 'Delete') rawCapabilities.canDelete = true;
      if (op === 'Role_Management') rawCapabilities.canManageRoles = true;
    });

    return {
      raw: {
        ...capabilities,
        capabilities: rawCapabilities, // Override with boolean map for test compatibility
        grantedOperations: granted,
      },
      humanMessage: `Capabilities for account ${request.account.accountId} for stablecoin ${request.tokenId}: ${granted.length > 0 ? granted.join(', ') : 'NONE'}.`,
    };
  }

  async shouldSecondaryAction() {
    return false;
  }

  async secondaryAction(request: any, _client: Client, _context: Context) {
    return request;
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to get stablecoin capabilities';
    const message = desc + (error instanceof Error ? `: ${error.message}` : '');
    return {
      raw: { status: Status.InvalidTransaction, error: message },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new GetStablecoinCapabilitiesTool(context, config);

export default tool;
