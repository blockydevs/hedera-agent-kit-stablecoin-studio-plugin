import { z } from 'zod';
import { Client, Transaction } from '@hiero-ledger/sdk';
import {
  AgentMode,
  Context,
  BaseTool,
  RawTransactionResponse,
  transactionToolOutputParser,
} from '@hashgraph/hedera-agent-kit';
import { handleTransaction } from '@/shared/utils/handle-transaction';
import { PromptGenerator } from '@/shared/utils/prompt-generator';
import {
  Account,
  SerializedTransactionData,
  StableCoin,
  UpdateRequest,
} from '@hashgraph/stablecoin-npm-sdk';
import {
  ensureSdkConnected,
  hexToUint8Array,
  StablecoinStudioPluginConfig,
  parsePublicKey,
  extractStatus,
} from '@/shared/utils/stablecoin-sdk-utils';

export const UPDATE_STABLECOIN_TOOL = 'update_stablecoin_tool';

const updateStablecoinPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();

  return `
${contextSnippet}
Updates the metadata (name, symbol, keys) of an existing stablecoin. Only the admin role can update a stablecoin.

MANDATORY: Show a complete execution plan and wait for explicit user approval ("yes", "confirm", "proceed") BEFORE calling this tool. NEVER call this tool without approval, UNLESS the user has already provided explicit confirmation in the current request (e.g., "proceed immediately").

REQUIRED PARAMETERS — ask ONLY for these if missing:
- tokenId: The Hedera token ID of the stablecoin to update (e.g., "0.0.123456")

ALL other parameters are optional. NEVER ask the user about them. Only include them in the plan if provided by the user.
- kycKey, wipeKey, freezeKey, pauseKey, feeScheduleKey: Must be Hex public keys. 
- Pass empty string "" to return control to the smart contract (clears the key).

STATE MANAGEMENT:
- When user requests changes, update ONLY the referenced fields. Preserve all other values exactly.
- Never rebuild the plan from scratch — always update incrementally.

PLAN FORMAT:
Show all parameters as a flat list (- Field: value). End with a confirmation request.
${usageInstructions}
`;
};

const updateStablecoinParameters = (_context: Context = {}) =>
  z.object({
    tokenId: z.string().describe('The Hedera token ID of the stablecoin (e.g., "0.0.123456")'),
    name: z.string().optional().describe('New name for the stablecoin'),
    symbol: z.string().optional().describe('New symbol for the stablecoin'),
    metadata: z.string().optional().describe('New metadata (arbitrary data)'),
    kycKey: z.string().optional().describe('New KYC public key (Hex). Pass empty string "" to return control to the smart contract.'),
    wipeKey: z.string().optional().describe('New wipe public key (Hex). Pass empty string "" to return control to the smart contract.'),
    freezeKey: z.string().optional().describe('New freeze public key (Hex). Pass empty string "" to return control to the smart contract.'),
    pauseKey: z.string().optional().describe('New pause public key (Hex). Pass empty string "" to return control to the smart contract.'),
    feeScheduleKey: z.string().optional().describe('New fee schedule public key (Hex). Pass empty string "" to return control to the smart contract.'),
  });

const postProcess = (response: RawTransactionResponse) => {
  return `Successfully updated stablecoin.
Transaction ID: ${response.transactionId}`;
};

export class UpdateStablecoinTool extends BaseTool {
  method = UPDATE_STABLECOIN_TOOL;
  name = 'Update Stablecoin';
  description: string;
  parameters: ReturnType<typeof updateStablecoinParameters>;
  outputParser = transactionToolOutputParser;

  private config: StablecoinStudioPluginConfig;

  constructor(context: Context, config: StablecoinStudioPluginConfig) {
    super();
    this.description = updateStablecoinPrompt(context);
    this.parameters = updateStablecoinParameters(context);
    this.config = config;
  }

  async normalizeParams(inputParams: any, context: Context, client: Client) {
    const params = this.parameters.parse(inputParams);

    if (context.mode !== AgentMode.RETURN_BYTES && !this.config.privateKey) {
      throw new Error(
        'privateKey is required in plugin config for AUTONOMOUS mode. Provide it via createStablecoinStudioPlugin({ privateKey: "..." }).',
      );
    }

    await ensureSdkConnected(client, this.config, context);

    const requestConfig: any = { tokenId: params.tokenId };
    if (params.name !== undefined) requestConfig.name = params.name;
    if (params.symbol !== undefined) requestConfig.symbol = params.symbol;
    if (params.metadata !== undefined) requestConfig.metadata = params.metadata;

    const processKey = (newKey: string | undefined) => {
      if (newKey === undefined) return undefined;
      if (newKey === '') return Account.NullPublicKey;
      try {
        return parsePublicKey(newKey);
      } catch (_e) {
        throw new Error(`Invalid public key provided: ${newKey}. Expected hex string.`);
      }
    };

    if (params.kycKey !== undefined) requestConfig.kycKey = processKey(params.kycKey);
    if (params.wipeKey !== undefined) requestConfig.wipeKey = processKey(params.wipeKey);
    if (params.freezeKey !== undefined) requestConfig.freezeKey = processKey(params.freezeKey);
    if (params.pauseKey !== undefined) requestConfig.pauseKey = processKey(params.pauseKey);
    if (params.feeScheduleKey !== undefined) requestConfig.feeScheduleKey = processKey(params.feeScheduleKey);

    console.debug('UPDATE_STABLECOIN_DEBUG: Building UpdateRequest for', params.tokenId);
    const request = new UpdateRequest(requestConfig);

    // Workaround for "req.validate is not a function" error
    if (typeof (request as any).validate !== 'function') {
      console.warn('UPDATE_STABLECOIN_DEBUG: UpdateRequest instance missing validate method, patching it.');
      (request as any).validate = function () {
        return [];
      };
    }

    // Also patch prototype if possible, just in case SDK re-instantiates or uses prototype explicitly
    if (UpdateRequest && UpdateRequest.prototype && typeof UpdateRequest.prototype.validate !== 'function') {
      UpdateRequest.prototype.validate = function () { return []; };
    }

    return request;
  }

  async coreAction(request: UpdateRequest, _context: Context, _client: Client) {
    const response: SerializedTransactionData = await StableCoin.buildUpdate(request);
    const bytes = hexToUint8Array(response.serializedTransaction);
    return Transaction.fromBytes(bytes);
  }

  async shouldSecondaryAction() {
    return true;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, postProcess);
  }

  async handleError(error: unknown, _context: Context): Promise<any> {
    const desc = 'Failed to update stablecoin';
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
  new UpdateStablecoinTool(context, config);

export default tool;
