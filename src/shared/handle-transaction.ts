import {
  AccountId,
  Client,
  ScheduleId,
  TokenId,
  TopicId,
  Transaction,
  TransactionId,
  TransactionRecord,
} from '@hiero-ledger/sdk';
import { AgentMode, Context } from '@hashgraph/hedera-agent-kit';

interface TxModeStrategy {
  handle<T extends Transaction>(
    tx: T,
    client: Client,
    context: Context,
    postProcess?: (response: RawTransactionResponse) => unknown,
    extendResponse?: (
      raw: RawTransactionResponse,
      record: TransactionRecord,
    ) => RawTransactionResponse | Promise<RawTransactionResponse>,
  ): Promise<unknown>;
}

export interface RawTransactionResponse {
  status: string;
  accountId: AccountId | null;
  tokenId: TokenId | null;
  transactionId: string;
  topicId: TopicId | null;
  scheduleId: ScheduleId | null;
}

export interface ExecuteStrategyResult {
  raw: RawTransactionResponse;
  humanMessage: string;
}

export class ExecuteStrategy implements TxModeStrategy {
  defaultPostProcess(response: RawTransactionResponse): string {
    return JSON.stringify(response, null, 2);
  }

  async handle(
    tx: Transaction,
    client: Client,
    _context: Context,
    postProcess: (response: RawTransactionResponse) => string = this.defaultPostProcess,
    extendResponse?: (
      raw: RawTransactionResponse,
      record: TransactionRecord,
    ) => RawTransactionResponse | Promise<RawTransactionResponse>,
  ) {
    const submit = await tx.execute(client);
    const receipt = await submit.getReceipt(client);
    console.log('Transaction executed. Receipt:', receipt);

    let rawTransactionResponse: RawTransactionResponse = {
      status: receipt.status.toString(),
      accountId: receipt.accountId,
      tokenId: receipt.tokenId,
      transactionId: tx.transactionId?.toString() ?? '',
      topicId: receipt.topicId,
      scheduleId: receipt.scheduleId,
    };

    // override the response with custom details extractor
    if (extendResponse) {
      const record = await submit.getRecord(client);
      rawTransactionResponse = await extendResponse(rawTransactionResponse, record);
    }

    return {
      raw: rawTransactionResponse,
      humanMessage: postProcess(rawTransactionResponse),
    };
  }
}

class ReturnBytesStrategy implements TxModeStrategy {
  async handle(
    tx: Transaction,
    client: Client,
    context: Context,
    _postProcess?: (response: RawTransactionResponse) => string,
    _extendResponse?: (
      raw: RawTransactionResponse,
      record: TransactionRecord,
    ) => RawTransactionResponse | Promise<RawTransactionResponse>,
  ) {
    if (!context.accountId)
      throw new Error('Account ID is required in context for RETURN_BYTES mode');

    // Only set transaction ID and freeze if not already frozen
    // Stablecoin Studio SDK returns already frozen transactions
    if (!tx.isFrozen()) {
      const id = TransactionId.generate(context.accountId);
      tx.setTransactionId(id).freezeWith(client);
    }

    return {
      raw: {
        bytes: tx.toBytes(),
      },
      humanMessage: 'Transaction ready for signing.',
    };
  }
}

const getStrategyFromContext = (context: Context) => {
  if (context.mode === AgentMode.RETURN_BYTES) {
    return new ReturnBytesStrategy();
  }
  return new ExecuteStrategy();
};

export const handleTransaction = async (
  tx: Transaction,
  client: Client,
  context: Context,
  postProcess?: (response: RawTransactionResponse) => string,
  extendResponse?: (
    raw: RawTransactionResponse,
    record: TransactionRecord,
  ) => RawTransactionResponse | Promise<RawTransactionResponse>,
) => {
  const strategy = getStrategyFromContext(context);
  return await strategy.handle(tx, client, context, postProcess, extendResponse);
};
