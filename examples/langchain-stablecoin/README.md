# Hedera Agent Kit - LangChain Stablecoin Examples

This directory contains examples of how to integrate the **Stablecoin Studio Plugin** with the **Hedera Agent Kit** using **LangChain**. 

## Examples

### 1. Autonomous Mode (`autonomous-agent.ts`)
A full-featured agent that has access to the operator's private key. It can autonomously sign and execute transactions on the Hedera network based on natural language requests.

### 2. Return Bytes Mode (`return-bytes-agent.ts`)
A security-conscious "Human-in-the-loop" agent. It does **not** have access to the user's private key. Instead, it prepares the raw transaction bytes and returns them to the caller for external confirmation, signing, and execution.

## Prerequisites

- **Node.js**: Version 18 or higher.
- **OpenAI API Key**: For the LangChain LLM (GPT-4o-mini).
- **Hedera Testnet Account**: An account ID and an **ECDSA** private key.

## Setup

1.  **Environment Variables**:
    Create a `.env` file in this directory based on the following template:

    ```env
    ACCOUNT_ID=0.0.xxxxxx
    PRIVATE_KEY=your_ecdsa_private_key
    OPENAI_API_KEY=sk-xxxxxx
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

## Running the Examples

### Run Autonomous Agent
```bash
npm run start:autonomous
```

### Run Return Bytes Agent
```bash
npm run start:return-bytes
```

## How it Works

- **Autonomous Mode**: Uses `AgentMode.AUTONOMOUS`. The plugin is initialized with a private key, allowing it to handle the full transaction lifecycle.
- **Return Bytes Mode**: Uses `AgentMode.RETURN_BYTES`. The plugin is initialized without a private key. The script uses `ResponseParserService` to extract transaction bytes from the agent's output, which are then signed locally by the CLI tool after user confirmation.
