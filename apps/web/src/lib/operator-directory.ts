// Curated public-facing operator information (explorer-side editorial content).
//
// Chain metadata carries almost nothing human today (a moniker at best), but a prospective
// participant needs plain answers: who runs this, what is it for, how are rewards shared.
// Until operators publish this on chain (phase 15 §8.1), the explorer carries it HERE — and
// labels every field `configured`, because it comes from this file, not from the chain and
// not from the operator's own metadata. Keep the copy plain: it is written for clients, not
// chain engineers.

export interface CuratedOperator {
  name: string;
  ownedBy: string;
  website?: string;
  service: string;
  /** The distribution policy in plain words. */
  distributionPolicy: string;
  /** Short paragraphs, client-readable. */
  about: string[];
  /** A prominent note (e.g. testing slots that will be retired). */
  disclaimer?: string;
}

export const CURATED_OPERATORS: Record<string, CuratedOperator> = {
  '1': {
    name: 'Twilight Validator 1',
    ownedBy: 'Twilight team',
    website: 'https://nyks.dev',
    service: 'Network validation (testing)',
    distributionPolicy:
      'This slot does not distribute mining rewards to the public. Its epoch entitlements remain unsettled or return to the operator.',
    about: [
      'Run by the Twilight team to keep the test network producing and signing blocks while the network bootstraps.',
    ],
    disclaimer:
      'Testing slot — run by the Twilight team for now. As independent operators join the network, this slot will be retired.',
  },
  '2': {
    name: 'Twilight Validator 2',
    ownedBy: 'Twilight team',
    website: 'https://nyks.dev',
    service: 'Network validation (testing)',
    distributionPolicy:
      'This slot does not distribute mining rewards to the public. Its epoch entitlements remain unsettled or return to the operator.',
    about: [
      'Run by the Twilight team to keep the test network producing and signing blocks while the network bootstraps.',
    ],
    disclaimer:
      'Testing slot — run by the Twilight team for now. As independent operators join the network, this slot will be retired.',
  },
  '3': {
    name: 'Twilight Search Mining',
    ownedBy: 'Twilight team',
    website: 'https://rewards.nyks.dev',
    service: 'Search mining (dropin-miner)',
    distributionPolicy:
      'Every epoch, this slot’s reward is split equally among all admitted participants. Admission needs an enrollment in time, verified search activity, and a valid payout address. Anything undistributed returns to the operator.',
    about: [
      'The flagship participation slot: run search queries through the dropin-miner client and earn a share of this slot’s reward every epoch.',
      'The operator publishes a live status feed (clock, per-epoch counts and reasons), a draw record, and per-epoch allocation hashes — the explorer checks its published figures against the chain on every settled epoch.',
    ],
  },
  '4': {
    name: 'Twilight OpenRouter Slot',
    ownedBy: 'Twilight team',
    website: 'https://openrouter.ai',
    service: 'OpenRouter inference routing',
    distributionPolicy:
      'Rewards accrue to participants who route inference traffic through the OpenRouter integration. Distribution follows the same equal-split settlement as the search slot.',
    about: [
      'Run by the Twilight team: this slot rewards inference usage routed through OpenRouter rather than search activity.',
      'Participation tooling for this slot is still being rolled out — watch this page for the status feed going live.',
    ],
  },
};

export function curatedOperator(slotId: string): CuratedOperator | null {
  return CURATED_OPERATORS[slotId] ?? null;
}
