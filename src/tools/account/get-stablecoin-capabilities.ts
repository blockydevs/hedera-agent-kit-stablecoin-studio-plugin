import { z } from 'zod';
import { Client } from '@hiero-ledger/sdk';
import { Context, BaseTool } from '@hashgraph/hedera-agent-kit';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import {
  StableCoin,
  CapabilitiesRequest,
  StableCoinCapabilities,
  Operation,
  Access,
  Role,
  HasRoleRequest,
  StableCoinRole,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  initSdk,
  connectSdk,
  resolveNetwork,
  StablecoinStudioPluginConfig,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';
import { stablecoinOutputParser } from '@/shared/utils/stablecoin-output-parser';


export const GET_STABLECOIN_CAPABILITIES_TOOL = 'get_stablecoin_capabilities_tool';

const getRoleForOperation = (op: Operation): StableCoinRole | undefined => {
  switch (op) {
    case Operation.BURN: return StableCoinRole.BURN_ROLE;
    case Operation.CASH_IN: return StableCoinRole.CASHIN_ROLE;
    case Operation.WIPE: return StableCoinRole.WIPE_ROLE;
    case Operation.FREEZE:
    case Operation.UNFREEZE: return StableCoinRole.FREEZE_ROLE;
    case Operation.PAUSE:
    case Operation.UNPAUSE: return StableCoinRole.PAUSE_ROLE;
    case Operation.RESCUE:
    case Operation.RESCUE_HBAR: return StableCoinRole.RESCUE_ROLE;
    case Operation.DELETE: return StableCoinRole.DELETE_ROLE;
    case Operation.GRANT_KYC:
    case Operation.REVOKE_KYC: return StableCoinRole.KYC_ROLE;
    case Operation.CREATE_CUSTOM_FEE:
    case Operation.REMOVE_CUSTOM_FEE: return StableCoinRole.CUSTOM_FEES_ROLE;
    case Operation.CREATE_HOLD: return StableCoinRole.HOLD_CREATOR_ROLE;
    case Operation.ROLE_MANAGEMENT:
    case Operation.ROLE_ADMIN_MANAGEMENT:
    case Operation.UPDATE:
    case Operation.UPDATE_CONFIG_VERSION:
    case Operation.UPDATE_CONFIG:
    case Operation.UPDATE_RESOLVER:
    case Operation.RESERVE_MANAGEMENT:
    case Operation.CONTROLLER_CREATE_HOLD:
      return StableCoinRole.DEFAULT_ADMIN_ROLE;
    default:
      return undefined;
  }
};

const getStablecoinCapabilitiesPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}

This tool retrieves the capabilities and permissions of an account for a given stablecoin on the Hedera network. It shows which roles (CASHIN, BURN, WIPE, FREEZE, PAUSE, RESCUE) are assigned to the target account.

Important:
- HTS Access: For tokens with direct HTS keys, the result is an accurate check against the provided account's public key.
- CONTRACT Access: For tokens managed by smart contracts, the tool now verifies if the account specifically holds the required role in the contract's governance system.

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
  outputParser = stablecoinOutputParser;


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
    const rawCapabilitiesFromSdk: StableCoinCapabilities = await StableCoin.capabilities(request);
    let list = rawCapabilitiesFromSdk.capabilities || [];

    // Filter CONTRACT capabilities by checking actual on-chain roles
    const filteredList = await Promise.all(
      list.map(async (c) => {
        if (c.access !== Access.CONTRACT) return c; // HTS is already validated

        const role = getRoleForOperation(c.operation);
        if (!role) return c; // Cannot definitively check, keep it by default

        try {
          const hasRole = await Role.hasRole(
            new HasRoleRequest({
              tokenId: request.tokenId,
              targetId: request.account.accountId,
              role: role,
            }),
          );
          return hasRole ? c : null;
        } catch (error) {
          // If the query fails (e.g., token isn't a smart contract or node error)
          console.warn(`Failed to check role ${role} for operation ${c.operation}:`, error);
          return null; 
        }
      }),
    );

    list = filteredList.filter((c) => c !== null) as typeof list;

    const capabilityList = list.map(c => ({
      operation: c.operation,
      access: Access[c.access] || c.access.toString(),
    }));

    // Map capabilities to boolean flags for easier matching in tests/UI
    const rawCapabilities: Record<string, boolean> = {
      canBurn: false,
      canMint: false,
      canWipe: false,
      canFreeze: false,
      canUnfreeze: false,
      canPause: false,
      canUnpause: false,
      canRescue: false,
      canDelete: false,
      canManageRoles: false,
      canGrantKyc: false,
      canRevokeKyc: false,
      canManageFees: false,
    };

    const granted: string[] = [];

    list.forEach(c => {
      const op = c.operation;
      granted.push(op);

      if (op === Operation.BURN) rawCapabilities.canBurn = true;
      if (op === Operation.CASH_IN) rawCapabilities.canMint = true;
      if (op === Operation.WIPE) rawCapabilities.canWipe = true;
      if (op === Operation.FREEZE) rawCapabilities.canFreeze = true;
      if (op === Operation.UNFREEZE) rawCapabilities.canUnfreeze = true;
      if (op === Operation.PAUSE) rawCapabilities.canPause = true;
      if (op === Operation.UNPAUSE) rawCapabilities.canUnpause = true;
      if (op === Operation.RESCUE) rawCapabilities.canRescue = true;
      if (op === Operation.DELETE) rawCapabilities.canDelete = true;
      if (op === Operation.ROLE_MANAGEMENT) rawCapabilities.canManageRoles = true;
      if (op === Operation.GRANT_KYC) rawCapabilities.canGrantKyc = true;
      if (op === Operation.REVOKE_KYC) rawCapabilities.canRevokeKyc = true;
      if (op === Operation.CREATE_CUSTOM_FEE || op === Operation.REMOVE_CUSTOM_FEE)
        rawCapabilities.canManageFees = true;
    });

    return {
      raw: {
        tokenId: rawCapabilitiesFromSdk.coin.tokenId?.toString() || request.tokenId,
        accountId: rawCapabilitiesFromSdk.account.id?.toString() || request.account.accountId,
        capabilities: rawCapabilities, // Maintain boolean map for compatibility
        capabilityList,
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
      raw: {
        status: extractStatus(error),
        error: message,
      },
      humanMessage: message,
    };
  }
}

const tool = (context: Context, config: StablecoinStudioPluginConfig): BaseTool =>
  new GetStablecoinCapabilitiesTool(context, config);

export default tool;
