import { AgentMode } from '@hashgraph/hedera-agent-kit';
import {
  HederaLangchainToolkit,
  ResponseParserService,
} from '@hashgraph/hedera-agent-kit-langchain';
import { Client, PrivateKey, Transaction } from '@hiero-ledger/sdk';
import prompts from 'prompts';
import * as dotenv from 'dotenv';
import { createAgent } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import {
  createStablecoinStudioPlugin,
  stablecoinStudioPluginToolNames,
} from 'hak-stablecoin-studio-plugin';

dotenv.config();

function validateEnv() {
  const required = ['ACCOUNT_ID', 'PRIVATE_KEY', 'OPENAI_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your keys.');
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  validateEnv();

  const operatorAccountId = process.env.ACCOUNT_ID!;
  const operatorPrivateKey = PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY!);

  // Hedera client setup for the "Human-in-the-loop" side (Testnet by default)
  // This client represents the entity that will actually sign and execute the bytes.
  const humanInTheLoopClient = Client.forTestnet().setOperator(
    operatorAccountId,
    operatorPrivateKey,
  );

  // The agent client does not have an operator in this mode, as it only returns bytes.
  const agentClient = Client.forTestnet();

  // Prepare Hedera toolkit
  const hederaAgentToolkit = new HederaLangchainToolkit({
    client: agentClient,
    configuration: {
      plugins: [
        createStablecoinStudioPlugin({
          accountId: operatorAccountId,
          // Note: No privateKey provided to the plugin, simulating a limited-access agent.
        }) as any,
      ],
      context: {
        mode: AgentMode.RETURN_BYTES,
        accountId: operatorAccountId,
      },
    },
  });

  // Fetch tools from a toolkit
  const tools = hederaAgentToolkit.getTools();

  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
  });

  const agent = createAgent({
    model: llm,
    tools: tools,
    systemPrompt:
      'You are a Hedera Stablecoin Assistant. You operate in "Return Bytes" mode, meaning for any state-changing operation (create, mint, burn, etc.), you return raw transaction bytes for external signing. You do NOT execute transactions yourself. For queries (balance, info), you return data directly.',
    checkpointer: new MemorySaver(),
  });

  const responseParsingService = new ResponseParserService(hederaAgentToolkit.getTools());

  console.log('Hedera Agent CLI - RETURN_BYTES Mode with Stablecoin Studio Plugin — type "exit" to quit');
  console.log('Available plugin tools:');
  Object.entries(stablecoinStudioPluginToolNames).forEach(([_key, value]) => {
    console.log(`- ${value}`);
  });
  console.log('');

  while (true) {
    const { userInput } = await prompts({
      type: 'text',
      name: 'userInput',
      message: 'You',
    });

    if (!userInput || ['exit', 'quit'].includes(userInput.trim().toLowerCase())) {
      console.log('Goodbye!');
      break;
    }

    try {
      const response = await agent.invoke(
        { messages: [{ role: 'user', content: userInput }] },
        { configurable: { thread_id: '1' } },
      );

      const parsedToolData = responseParsingService.parseNewToolMessages(response);
      const toolCall = parsedToolData[0];

      if (!toolCall) {
        console.log(`AI: ${response.messages[response.messages.length - 1].content}`);
      } else {
        // Handle RETURN_BYTES mode
        if (toolCall.parsedData?.raw?.bytes) {
          console.log('\n--- Transaction Bytes Received ---');
          const bytes = toolCall.parsedData.raw.bytes;
          
          const confirm = await prompts({
            type: 'confirm',
            name: 'value',
            message: 'A transaction has been prepared. Do you want to sign and execute it?',
            initial: true
          });

          if (confirm.value) {
            console.log('Executing transaction...');
            const tx = Transaction.fromBytes(bytes);
            const result = await tx.execute(humanInTheLoopClient);
            const receipt = await result.getReceipt(humanInTheLoopClient);

            console.log('Transaction Status:', receipt.status.toString());
            console.log('Transaction ID:', result.transactionId.toString());
          } else {
            console.log('Transaction cancelled by user.');
          }
        } 
        // Handle Query tool calls
        else {
          console.log(`\nAI: ${response.messages[response.messages.length - 1].content}`);
          console.log('\n--- Tool Data ---');
          console.log('Direct response:', toolCall.parsedData.humanMessage);
        }
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }
}

bootstrap()
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
