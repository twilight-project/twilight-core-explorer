import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_SLOT_REST_ROUTES,
  MINING_REST_ROUTES,
  REQUIRED_TWILIGHT_REST_ROUTES,
  REWARDS_REST_ROUTES,
} from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const swaggerPath = join(repoRoot, 'app/openapi/twilight.swagger.json');
const restRoutesPath = join(repoRoot, 'docs/reference/rest-routes.md');

const swagger = JSON.parse(readFileSync(swaggerPath, 'utf8'));
const restRoutes = readFileSync(restRoutesPath, 'utf8');
const paths = new Set(Object.keys(swagger.paths ?? {}));

const rewardsRoutes = [
  '/twilight/rewards/v1/params',
  '/twilight/rewards/v1/epoch-info',
  '/twilight/rewards/v1/next-halving',
  '/twilight/rewards/v1/epochs/{epoch_number}',
  '/twilight/rewards/v1/cumulative-emitted',
  '/twilight/rewards/v1/supply-schedule',
  '/twilight/rewards/v1/current-epoch/active-blocks',
  '/twilight/rewards/v1/module-balances',
  // V2: entitlements replace the retired claim queries.
  '/twilight/rewards/v1/epochs/{epoch}/entitlements',
  '/twilight/rewards/v1/slots/{slot_id}/entitlements/{epoch}',
  '/twilight/rewards/v1/epochs/{epoch_number}/boundaries',
  '/twilight/rewards/v1/pause-state',
  '/twilight/rewards/v1/epoch-config-versions',
  '/twilight/rewards/v1/reward-config-versions',
];

// Retired by twilight-core aa568f61 ("retire the legacy claim path"). Asserting their
// ABSENCE stops the dead claim surface being silently reintroduced.
const retiredRewardsRoutes = [
  '/twilight/rewards/v1/slots/{slot_id}/rewards',
  '/twilight/rewards/v1/slots/{slot_id}/claimable',
];

const miningRoutes = [
  '/twilight/mining/v1/settlement-clock',
  '/twilight/mining/v1/settlements/{slot_id}/{epoch}',
  '/twilight/mining/v1/slots/{slot_id}/open-settlements',
  '/twilight/mining/v1/distribution-mode-versions',
  '/twilight/mining/v1/selection-params-versions',
  '/twilight/mining/v1/settlement-params-versions',
  '/twilight/mining/v1/target-epochs/{target_epoch}',
  '/twilight/mining/v1/economic-address',
];

const coreSlotRoutes = [
  '/twilight/coreslot/v1/params',
  '/twilight/coreslot/v1/slots/{slot_id}',
  '/twilight/coreslot/v1/slots',
  '/twilight/coreslot/v1/active-slots',
  '/twilight/coreslot/v1/operators/{operator_address}',
  '/twilight/coreslot/v1/consensus/{consensus_address}',
  '/twilight/coreslot/v1/pending-key-rotations',
  '/twilight/coreslot/v1/last-applied-validators',
  '/twilight/coreslot/v1/reserved-consensus-address/{consensus_address}',
  '/twilight/coreslot/v1/slots/{slot_id}/reward-weight',
  '/twilight/coreslot/v1/slots/{slot_id}/selection-policy',
  '/twilight/coreslot/v1/slots/{slot_id}/selection-policy/version/{policy_version}',
  '/twilight/coreslot/v1/slots/{slot_id}/selection-policy/height/{at_height}',
];

const forbiddenStandardModulePatterns = [
  /\/cosmos\/staking\//,
  /\/cosmos\/gov\//,
  /\/cosmos\/mint\//,
  /\/cosmos\/distribution\//,
];

const ignoredDirs = new Set([
  '.git',
  '.agents',
  '.codex',
  'node_modules',
  'reference',
]);

const ignoredFiles = new Set([
  'docs/reference/rest-routes.md',
  'docs/research/explorer-old-repo-audit.md',
]);

function assertRoutesPresent(expectedRoutes) {
  for (const route of expectedRoutes) {
    assert.equal(paths.has(route), true, `missing route in Swagger contract: ${route}`);
    assert.match(restRoutes, new RegExp(escapeRegExp(route)), `missing route in rest-routes.md: ${route}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walkFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkFiles(fullPath, files);
    } else if (stat.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Twilight REST route contract', () => {
  it('imports the current Swagger route inventory', () => {
    assert.equal(swagger.swagger, '2.0');
    assert.equal(paths.size, 80);
  });

  it('contains every live x/rewards query route', () => {
    assertRoutesPresent(rewardsRoutes);
    assert.deepEqual(Object.values(REWARDS_REST_ROUTES).sort(), [...rewardsRoutes].sort());
  });

  it('contains every live x/coreslot query route', () => {
    assertRoutesPresent(coreSlotRoutes);
    assert.deepEqual(Object.values(CORE_SLOT_REST_ROUTES).sort(), [...coreSlotRoutes].sort());
  });

  it('contains every live x/mining query route', () => {
    assertRoutesPresent(miningRoutes);
    assert.deepEqual(Object.values(MINING_REST_ROUTES).sort(), [...miningRoutes].sort());
  });

  it('no longer declares the retired rewards claim routes', () => {
    const declared = Object.values(REWARDS_REST_ROUTES);
    for (const route of retiredRewardsRoutes) {
      assert.equal(
        declared.includes(route),
        false,
        `retired route still declared in REWARDS_REST_ROUTES: ${route}`,
      );
      assert.equal(paths.has(route), false, `retired route still in Swagger: ${route}`);
    }
  });

  it('uses the validated active slots route', () => {
    const legacyActiveSlotsRoute = `/twilight/coreslot/v1/slots/${'active'}`;
    assert.equal(paths.has('/twilight/coreslot/v1/active-slots'), true);
    assert.equal(paths.has(legacyActiveSlotsRoute), false);
    assert.equal(CORE_SLOT_REST_ROUTES.activeSlots, '/twilight/coreslot/v1/active-slots');
    assert.equal(Object.values(CORE_SLOT_REST_ROUTES).includes(legacyActiveSlotsRoute), false);
    assert.match(restRoutes, /\/twilight\/coreslot\/v1\/active-slots/);
    assert.doesNotMatch(restRoutes, /\|\s*`\/twilight\/coreslot\/v1\/slots\/active`\s*\|/);
  });

  it('keeps route constants aligned with the imported route contract', () => {
    assert.equal(REQUIRED_TWILIGHT_REST_ROUTES.length, 35);
    for (const route of REQUIRED_TWILIGHT_REST_ROUTES) {
      assert.equal(paths.has(route), true, `route constant missing from Swagger: ${route}`);
      assert.match(restRoutes, new RegExp(escapeRegExp(route)));
    }
  });

  it('does not expose unsupported standard module routes in Swagger', () => {
    for (const route of paths) {
      for (const pattern of forbiddenStandardModulePatterns) {
        assert.doesNotMatch(route, pattern, `unsupported route exposed in Swagger: ${route}`);
      }
    }
  });

  it('keeps unsupported standard module paths out of implementation files', () => {
    const offenders = [];
    for (const file of walkFiles(repoRoot)) {
      const rel = relative(repoRoot, file);
      if (ignoredFiles.has(rel)) continue;
      if (rel === 'app/openapi/twilight.swagger.json') continue;
      const text = readFileSync(file, 'utf8');
      for (const pattern of forbiddenStandardModulePatterns) {
        if (pattern.test(text)) offenders.push(rel);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
