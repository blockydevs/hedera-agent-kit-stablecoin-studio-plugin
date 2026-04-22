import { Context, AgentMode } from '@hashgraph/hedera-agent-kit';

export class PromptGenerator {
  /**
   * Generates a consistent context snippet for tool prompts.
   */
  static getContextSnippet(context: Context): string {
    const lines = ['Context:'];

    const mode = (context as any).mode || AgentMode.AUTONOMOUS;
    const accountId = (context as any).accountId;
    const accountPublicKey = (context as any).accountPublicKey;

    if (mode === AgentMode.RETURN_BYTES) {
      lines.push(`- Mode: Return Bytes (preparing transactions for user signing)`);
      if (accountId) {
        lines.push(`- User Account: ${accountId} (default for transaction parameters)`);
        if (accountPublicKey) {
          lines.push(`- Account Public Key: ${accountPublicKey}`);
        }
        lines.push(`- When no account is specified, ${accountId} will be used`);
      } else {
        lines.push(`- User Account: Not specified`);
      }
    } else if (mode === AgentMode.AUTONOMOUS) {
      lines.push(`- Mode: Autonomous (agent executes transactions directly)`);
      if (accountId) {
        lines.push(`- User Account: ${accountId}`);
        if (accountPublicKey) {
          lines.push(`- Account Public Key: ${accountPublicKey}`);
        }
      }
    } else {
      lines.push(`- Mode: ${mode}`);
      if (accountId) {
        lines.push(`- User Account: ${accountId}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generates consistent parameter usage instructions.
   */
  static getParameterUsageInstructions(): string {
    return `
Important:
- Do not request or ask for parameters that are optional and were not provided by the user. Tool can be called without any parameters if all are optional.
- Only include optional parameters if explicitly provided by the user
- Do not generate placeholder values for optional fields
- Leave optional parameters undefined if not specified by the user
- If a required parameter is not specified by the user, DO NOT guess or generate placeholder values. You must stop and ask the user for the missing required information.
- Important: If the user mentions multiple recipients or amounts and tool accepts an array, combine all recipients, tokens or similar assets into a single array and make exactly one call to that tool. Do not split the action into multiple tool calls if it's possible to do so.
`;
  }
}
