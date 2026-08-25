import type { ChainClient } from '@twilight-explorer/chain-client';
import { extractAccountsFromValues } from './account-extraction.js';
import {
  extractBlockResultEvents,
  extractDecodeFailuresFromTx,
  extractEventsFromTx,
  extractMessagesFromTx,
  mapBlockSourceToBlockRow,
  mapTxSourceToTransactionRow,
  type DecodeFailureRow,
  type EventRow,
  type MessageRow,
  type TransactionRow,
} from './mapper.js';
import {
  haltCursorError,
  haltCursorHashMismatch,
  updateCursorSuccess,
  type CursorPrisma,
} from './cursor.js';

export interface IngestHeightArgs {
  chainId: string;
  height: bigint;
  latestChainHeight?: bigint | undefined;
  client: ChainClient;
  prisma: IngestPrisma;
  /**
   * Skip the IndexerCursor write. `lastIndexedHeight` is a CONTIGUOUS watermark ("everything
   * at or below this is indexed"), so when heights are ingested concurrently the individual
   * height must NOT stamp it — a height finishing out of order would claim its unfinished
   * predecessors. `ingestRange` owns the watermark in that mode and advances it only across
   * the completed contiguous prefix.
   */
  skipCursorUpdate?: boolean | undefined;
}

export interface IngestHeightResult {
  height: bigint;
  blockHash: string | undefined;
  txCount: number;
  eventCount: number;
  messageCount: number;
}

export interface IngestPrisma extends CursorPrisma {
  block: {
    findUnique(args: unknown): Promise<{ hash?: string | null } | null>;
    upsert(args: unknown): Promise<unknown>;
  };
  explorerTransaction: {
    upsert(args: unknown): Promise<unknown>;
  };
  message: {
    upsert(args: unknown): Promise<unknown>;
  };
  event: {
    upsert(args: unknown): Promise<unknown>;
  };
  account: {
    upsert(args: unknown): Promise<unknown>;
  };
  decodeFailure: {
    create(args: unknown): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: IngestPrisma) => Promise<T>): Promise<T>;
}

export class HashMismatchError extends Error {
  constructor(
    readonly height: bigint,
    readonly expectedHash: string | undefined,
    readonly actualHash: string | undefined,
  ) {
    super(`Block hash mismatch at height ${height.toString()}`);
    this.name = 'HashMismatchError';
  }
}

export async function ingestHeight(args: IngestHeightArgs): Promise<IngestHeightResult> {
  const { chainId, height, client, prisma } = args;

  try {
    // These four reads are independent, and on a remote node each costs a full round trip
    // (~0.5 s to ap-southeast-1 from the explorer host). Serially that is ~1.5 s per block —
    // ~35 h to backfill devnet-2's 84k blocks. Issued together it is one round trip.
    // Promise.all rejects on the first failure, exactly like the sequential awaits did.
    const [block, blockResults, txs, existingBlock] = await Promise.all([
      client.getBlock(height),
      client.getBlockResults(height),
      client.getTxsByHeight(height),
      prisma.block.findUnique({ where: { height } }),
    ]);

    if (existingBlock?.hash && block.hash && existingBlock.hash !== block.hash) {
      await haltCursorHashMismatch(prisma, chainId, height, existingBlock.hash, block.hash);
      throw new HashMismatchError(height, existingBlock.hash, block.hash);
    }

    const blockRow = mapBlockSourceToBlockRow(chainId, block, txs.length);
    const txRows = txs.map((tx, index) => mapTxSourceToTransactionRow(tx, height, index));
    const messageRows = txs.flatMap((tx) => extractMessagesFromTx(tx));
    const decodeFailureRows = txs.flatMap((tx) => extractDecodeFailuresFromTx(tx));
    const txEventRows = txs.flatMap((tx, index) => extractEventsFromTx(tx, index));
    const blockEventRows = extractBlockResultEvents(blockResults);
    const eventRows = [...blockEventRows, ...txEventRows];
    const accountAddresses = extractAccountsFromValues([
      ...txs.map((tx) => tx.raw),
      ...eventRows.map((event) => event.attributesJson),
    ]);

    await prisma.$transaction(async (tx) => {
      await tx.block.upsert({
        where: { height },
        create: blockRow,
        update: blockRow,
      });

      for (const txRow of txRows) await upsertTransaction(tx, txRow);
      for (const messageRow of messageRows) await upsertMessage(tx, messageRow);
      for (const decodeFailureRow of decodeFailureRows) {
        await insertDecodeFailure(tx, decodeFailureRow);
      }
      for (const eventRow of eventRows) await upsertEvent(tx, eventRow);
      for (const address of accountAddresses) {
        await tx.account.upsert({
          where: { address },
          create: {
            address,
            firstSeenHeight: height,
            lastSeenHeight: height,
            txCount: 1,
            accountKind: address.startsWith('module:') ? 'module' : 'unknown',
          },
          update: {
            lastSeenHeight: height,
          },
        });
      }

      if (args.skipCursorUpdate !== true) {
        await updateCursorSuccess(tx, chainId, height, block.hash, args.latestChainHeight);
      }
    });

    return {
      height,
      blockHash: block.hash,
      txCount: txRows.length,
      eventCount: eventRows.length,
      messageCount: messageRows.length,
    };
  } catch (error) {
    if (!(error instanceof HashMismatchError)) {
      await haltCursorError(prisma, chainId, height, error);
    }
    throw error;
  }
}

async function upsertTransaction(prisma: IngestPrisma, row: TransactionRow): Promise<void> {
  await prisma.explorerTransaction.upsert({
    where: { hash: row.hash },
    create: row,
    update: row,
  });
}

async function upsertMessage(prisma: IngestPrisma, row: MessageRow): Promise<void> {
  await prisma.message.upsert({
    where: { txHash_msgIndex: { txHash: row.txHash, msgIndex: row.msgIndex } },
    create: row,
    update: row,
  });
}

async function upsertEvent(prisma: IngestPrisma, row: EventRow): Promise<void> {
  await prisma.event.upsert({
    where: { eventKey: row.eventKey },
    create: row,
    update: row,
  });
}

async function insertDecodeFailure(prisma: IngestPrisma, row: DecodeFailureRow): Promise<void> {
  await prisma.decodeFailure.create({
    data: row,
  });
}
