import { Plugin, Context } from '@hashgraph/hedera-agent-kit';
import getStablecoinInfoTool, {
  GET_STABLECOIN_INFO_TOOL,
} from './tools/lifecycle/get-stablecoin-info';
import createStablecoinTool, { CREATE_STABLECOIN_TOOL } from './tools/lifecycle/create-stablecoin';
import updateStablecoinTool, { UPDATE_STABLECOIN_TOOL } from './tools/lifecycle/update-stablecoin';
import pauseStablecoinTool, { PAUSE_STABLECOIN_TOOL } from './tools/lifecycle/pause-stablecoin';
import unpauseStablecoinTool, {
  UNPAUSE_STABLECOIN_TOOL,
} from './tools/lifecycle/unpause-stablecoin';
import deleteStablecoinTool, { DELETE_STABLECOIN_TOOL } from './tools/lifecycle/delete-stablecoin';
import cashInStablecoinTool, { CASH_IN_STABLECOIN_TOOL } from './tools/supply/cash-in-stablecoin';
import burnStablecoinTool, { BURN_STABLECOIN_TOOL } from './tools/supply/burn-stablecoin';
import wipeStablecoinTool, { WIPE_STABLECOIN_TOOL } from './tools/supply/wipe-stablecoin';
import rescueStablecoinTool, { RESCUE_STABLECOIN_TOOL } from './tools/supply/rescue-stablecoin';
import rescueHbarStablecoinTool, {
  RESCUE_HBAR_STABLECOIN_TOOL,
} from './tools/supply/rescue-hbar-stablecoin';
import associateStablecoinTool, {
  ASSOCIATE_STABLECOIN_TOOL,
} from './tools/account/associate-stablecoin';
import getStablecoinBalanceTool, {
  GET_STABLECOIN_BALANCE_TOOL,
} from './tools/account/get-stablecoin-balance';
import isAccountAssociatedTool, {
  IS_ACCOUNT_ASSOCIATED_TOOL,
} from './tools/account/is-account-associated';

export type { StablecoinStudioPluginConfig } from './stablecoin-sdk-utils';

export const createStablecoinStudioPlugin = (config: {
  accountId: string;
  privateKey?: string;
  network?: string;
  factoryAddress?: string;
  resolverAddress?: string;
}): Plugin => ({
  name: 'stablecoin-studio-plugin',
  version: '1.0.0',
  description:
    'A plugin for Hedera Stablecoin Studio management including lifecycle, supply, and account operations',
  tools: (context: Context) => {
    return [
      getStablecoinInfoTool(context, config),
      createStablecoinTool(context, config),
      updateStablecoinTool(context, config),
      pauseStablecoinTool(context, config),
      unpauseStablecoinTool(context, config),
      deleteStablecoinTool(context, config),
      cashInStablecoinTool(context, config),
      burnStablecoinTool(context, config),
      wipeStablecoinTool(context, config),
      rescueStablecoinTool(context, config),
      rescueHbarStablecoinTool(context, config),
      associateStablecoinTool(context, config),
      getStablecoinBalanceTool(context, config),
      isAccountAssociatedTool(context, config),
    ];
  },
});

export const stablecoinStudioPluginToolNames = {
  GET_STABLECOIN_INFO_TOOL,
  CREATE_STABLECOIN_TOOL,
  UPDATE_STABLECOIN_TOOL,
  PAUSE_STABLECOIN_TOOL,
  UNPAUSE_STABLECOIN_TOOL,
  DELETE_STABLECOIN_TOOL,
  CASH_IN_STABLECOIN_TOOL,
  BURN_STABLECOIN_TOOL,
  WIPE_STABLECOIN_TOOL,
  RESCUE_STABLECOIN_TOOL,
  RESCUE_HBAR_STABLECOIN_TOOL,
  ASSOCIATE_STABLECOIN_TOOL,
  GET_STABLECOIN_BALANCE_TOOL,
  IS_ACCOUNT_ASSOCIATED_TOOL,
} as const;

export {
  GET_STABLECOIN_INFO_TOOL,
  CREATE_STABLECOIN_TOOL,
  UPDATE_STABLECOIN_TOOL,
  PAUSE_STABLECOIN_TOOL,
  UNPAUSE_STABLECOIN_TOOL,
  DELETE_STABLECOIN_TOOL,
  CASH_IN_STABLECOIN_TOOL,
  BURN_STABLECOIN_TOOL,
  WIPE_STABLECOIN_TOOL,
  RESCUE_STABLECOIN_TOOL,
  RESCUE_HBAR_STABLECOIN_TOOL,
  ASSOCIATE_STABLECOIN_TOOL,
  GET_STABLECOIN_BALANCE_TOOL,
  IS_ACCOUNT_ASSOCIATED_TOOL,
};
