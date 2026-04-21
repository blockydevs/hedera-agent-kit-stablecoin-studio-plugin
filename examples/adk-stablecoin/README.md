# Hedera Stablecoin Agent - Google ADK Example

This example demonstrates how to build an AI agent using the **Hedera Agent Kit (HAK)**, the **Stablecoin Studio Plugin**, and **Google's Agent Development Kit (ADK)**.

## Prerequisites

- Node.js >= 20
- A [Google AI API Key](https://aistudio.google.com/apikey) (Gemini)
- A Hedera Testnet Account (obtain one from [Hedera Portal](https://portal.hedera.com/))

## Setup

### 1. Install dependencies

This example uses local references to the Hedera Agent Kit packages. Ensure you have the core repository and this plugin built.

```bash
npm install
```

### 2. Configure environment

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Add your Hedera credentials and Gemini API key:

```env
ACCOUNT_ID=0.0.xxxxx
PRIVATE_KEY=302e...
GEMINI_API_KEY=your-gemini-api-key
```

## Running the Agent

### Using the ADK CLI

You can run the agent directly from the command line:

```bash
npx adk run agent.ts
```

### Using the ADK Web Interface

The ADK also provides a web-based GUI for interacting with the agent:

```bash
npx adk web
```

By default, the interface will be available at `http://localhost:8000`.

## HAK v4 Notice

Starting with HAK v4, you must **explicitly pass all plugins** in the configuration. This example demonstrates the explicit opt-in for both core plugins and the Stablecoin Studio plugin:

```typescript
const hederaAgentToolkit = new HederaADKToolkit({
  client,
  configuration: {
    plugins: [
      coreAccountPlugin,
      coreTokenPlugin,
      // ...
      createStablecoinStudioPlugin({ ... }),
    ],
    // ...
  },
});
```
