import { createPrismaClient } from '@twilight-explorer/db';
import { withProjectionAdvisoryLock } from './advisory-lock.js';
import {
  makeFetchJson,
  parseOperatorStatusUrls,
  projectOperatorStatus,
  type OperatorStatusPrisma,
} from './operator-status-snapshot.js';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

// Feed sampler CLI. `OPERATOR_STATUS_URLS=3=https://rewards.nyks.dev[,…]`; empty means no
// slot publishes a feed and the run is a silent no-op (silence is a valid state, not an
// error). Feed outages are also not process failures — the samples record them and the API
// serves "no status right now" with the last good sample's age.
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the operator-status snapshot');
  }
  const urls = parseOperatorStatusUrls(process.env.OPERATOR_STATUS_URLS);
  if (urls.size === 0) {
    console.log('[operator-status] no OPERATOR_STATUS_URLS configured — nothing to sample');
    return;
  }

  const prisma = createPrismaClient();
  const fetchJson = makeFetchJson(
    Number.parseInt(process.env.OPERATOR_STATUS_TIMEOUT_MS ?? '10000', 10),
  );
  try {
    await withProjectionAdvisoryLock(prisma, async () => {
      for (const [slotId, baseUrl] of urls) {
        const r = await projectOperatorStatus({
          prisma: prisma as unknown as OperatorStatusPrisma,
          fetchJson,
          slotId,
          baseUrl,
        });
        console.log(
          `[operator-status] slot ${r.slotId}: clock=${r.clock} discovery=${r.discovery} ` +
            `epochs fetched=${r.epochsFetched} failed=${r.epochsFailed}`,
        );
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[operator-status] fatal:', err);
  process.exitCode = 1;
});
