import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  getDescriptorBytes,
  loadTwilightMsgTypeUrls,
  TWILIGHT_DESCRIPTOR_PATH,
  TWILIGHT_MSG_TYPE_URLS_PATH,
} from '../dist/index.js';

describe('Twilight proto artifacts', () => {
  it('ships descriptor and manifest files', () => {
    assert.equal(existsSync(TWILIGHT_DESCRIPTOR_PATH), true);
    assert.equal(existsSync(TWILIGHT_MSG_TYPE_URLS_PATH), true);
    assert.ok(getDescriptorBytes().byteLength > 0);
  });

  it('contains expected Twilight message type URLs', () => {
    const manifest = loadTwilightMsgTypeUrls();
    const serialized = JSON.stringify(manifest);

    assert.match(serialized, /\/twilight\.coreslot\.v1\.MsgUpdateOperatorMetadata/);
    // V2 additions: the settlement address + selection policy writers, and x/mining.
    assert.match(serialized, /\/twilight\.coreslot\.v1\.MsgUpdateSettlementAddress/);
    assert.match(serialized, /\/twilight\.coreslot\.v1\.MsgUpdateSelectionPolicy/);
    assert.match(serialized, /\/twilight\.mining\.v1\.MsgSubmitSettlementChunk/);
    assert.match(serialized, /\/twilight\.mining\.v1\.MsgFinalizeSettlement/);
  });

  it('no longer ships the retired rewards claim path', () => {
    // The chain deleted MsgClaimRewards ("retire the legacy claim path"). Asserting its
    // ABSENCE keeps a stale descriptor from silently reviving the dead claim surface.
    const serialized = JSON.stringify(loadTwilightMsgTypeUrls());
    assert.doesNotMatch(serialized, /MsgClaimRewards/);
  });
});
