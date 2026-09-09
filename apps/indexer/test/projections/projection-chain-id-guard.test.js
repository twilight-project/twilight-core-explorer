import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertProjectionChainId,
  getOrCreateProjectionCursor,
  ProjectionChainIdMismatchError,
} from '../../dist/projections/cursor.js';

// Ingest is the only path that verifies CHAIN_ID against the node (assertChainIdMatches).
// Projection CLIs just read `CHAIN_ID ?? 'twilight-localnet-1'`, so a wrong value used to
// silently create ProjectionCursor rows under a chain that does not exist — the projection
// then looks like it "never progresses". Projections now compare against the chain ingest
// actually indexed. This matters right now: the node was redeployed devnet-1 -> devnet-2.

function prismaWith(indexedChainId, options = {}) {
  const upserts = [];
  return {
    upserts,
    indexerCursor: indexedChainId === undefined
      ? undefined
      : { findFirst: async () => (indexedChainId === null ? null : { chainId: indexedChainId }) },
    projectionCursor: {
      upsert: async (args) => {
        if (options.failOnUpsert) throw new Error('cursor must not be written on mismatch');
        upserts.push(args);
        return args;
      },
    },
  };
}

describe('projection chain-id guard', () => {
  it('throws when CHAIN_ID disagrees with the indexed chain', async () => {
    await assert.rejects(
      () => assertProjectionChainId(prismaWith('twilight-devnet-2'), 'twilight-devnet-1'),
      ProjectionChainIdMismatchError,
    );
  });

  it('names both chains so the operator can tell which side is wrong', async () => {
    const error = await assertProjectionChainId(
      prismaWith('twilight-devnet-2'),
      'twilight-localnet-1',
    ).catch((e) => e);
    assert.match(error.message, /twilight-localnet-1/);
    assert.match(error.message, /twilight-devnet-2/);
  });

  it('passes when the chain ids agree', async () => {
    await assertProjectionChainId(prismaWith('twilight-devnet-2'), 'twilight-devnet-2');
  });

  it('is a no-op on a fresh database that has not ingested anything yet', async () => {
    await assertProjectionChainId(prismaWith(null), 'twilight-devnet-2');
  });

  it('tolerates a narrow prisma stub without indexerCursor (projection unit mocks)', async () => {
    await assertProjectionChainId(prismaWith(undefined), 'twilight-devnet-2');
  });

  it('blocks getOrCreateProjectionCursor before any cursor row is written', async () => {
    const prisma = prismaWith('twilight-devnet-2', { failOnUpsert: true });
    await assert.rejects(
      () => getOrCreateProjectionCursor(prisma, 'mining_semantic_v1', 'twilight-devnet-1'),
      ProjectionChainIdMismatchError,
    );
    assert.equal(prisma.upserts.length, 0);
  });

  it('creates the cursor normally when the chain matches', async () => {
    const prisma = prismaWith('twilight-devnet-2');
    await getOrCreateProjectionCursor(prisma, 'mining_semantic_v1', 'twilight-devnet-2');
    assert.equal(prisma.upserts.length, 1);
    assert.equal(prisma.upserts[0].create.chainId, 'twilight-devnet-2');
  });
});
