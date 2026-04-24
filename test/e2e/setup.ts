import { Client } from '@hiero-ledger/sdk';
import { 
    HederaLangchainToolkit,
    ResponseParserService
} from '@hashgraph/hedera-agent-kit-langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AgentMode } from '@hashgraph/hedera-agent-kit';
import { createStablecoinStudioPlugin } from '@/index';
import { getOperatorClientForTests } from '../integration/test-utils';
import { createAgent } from 'langchain';

export interface LangchainTestSetup {
  client: Client;
  agent: any;
  toolkit: HederaLangchainToolkit;
  responseParser: ResponseParserService;
  cleanup: () => void;
}

export const SYSTEM_PROMPT = `You are a Hedera blockchain assistant. You have access to tools for blockchain operations.
Always use the exact tool name and parameter structure expected by it.
Always call the best matching tool with best extracted params you can choose from the user input.
Do not make up parameters.`;

export async function createLangchainTestSetup(
  customClient?: Client, customPrivateKey?: string
): Promise<LangchainTestSetup> {
  const client = customClient || getOperatorClientForTests();
  const operatorAccountId = client.operatorAccountId!;
  const operatorPrivateKey = customClient ? (customPrivateKey || '') : (process.env.PRIVATE_KEY || '');

  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
  });

  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [
        createStablecoinStudioPlugin({
          accountId: operatorAccountId.toString(),
          privateKey: operatorPrivateKey?.toString(),
          network: 'testnet',
        }),
      ],
      context: {
        mode: AgentMode.AUTONOMOUS,
        accountId: operatorAccountId.toString(),
      },
    },
  });

  const tools = toolkit.getTools();
  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
  });

  const responseParser = new ResponseParserService(tools);

  const cleanup = () => client.close();

  return {
    client,
    agent,
    toolkit,
    responseParser,
    cleanup,
  };
}
