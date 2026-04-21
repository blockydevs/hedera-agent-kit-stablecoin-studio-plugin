import { Client, PrivateKey } from '@hiero-ledger/sdk';
import { LlmAgent } from '@google/adk';
import { AgentMode } from '@hashgraph/hedera-agent-kit';
import { HederaADKToolkit } from '@hashgraph/hedera-agent-kit-adk';
import * as dotenv from 'dotenv';
import {
    coreAccountPlugin,
    coreAccountQueryPlugin,
    coreConsensusPlugin,
    coreTokenPlugin,
    coreConsensusQueryPlugin,
    coreTokenQueryPlugin,
} from '@hashgraph/hedera-agent-kit/plugins';
import { createStablecoinStudioPlugin } from 'hak-stablecoin-studio-plugin';

dotenv.config();

const client = Client.forTestnet().setOperator(
    process.env.ACCOUNT_ID!,
    PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY!),
);

// Prepare Hedera toolkit
const hederaAgentToolkit = new HederaADKToolkit({
    client,
    configuration: {
        plugins: [
            coreAccountPlugin,
            coreAccountQueryPlugin,
            coreConsensusPlugin,
            coreConsensusQueryPlugin,
            coreTokenPlugin,
            coreTokenQueryPlugin,
            createStablecoinStudioPlugin({
                accountId: process.env.ACCOUNT_ID!,
                privateKey: process.env.PRIVATE_KEY!,
            }),
        ], // Load selected plugins
        tools: [], // Load all tools from selected plugins
        context: {
            mode: AgentMode.AUTONOMOUS,
            accountId: process.env.ACCOUNT_ID!,

        },
    },
});

export const agent = new LlmAgent({
    name: 'Hedera_Stablecoin_Agent',
    description: 'An AI assistant that can interact with the Hedera network and manage stablecoins.',
    model: 'gemini-3.1-flash-lite-preview',
    instruction:
        'You are a helpful assistant talking to an user. You can transfer HBAR, create and manage stablecoins, and interact with the Hedera network in other ways.',
    tools: hederaAgentToolkit.getTools(),
});
