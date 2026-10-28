// Bridge @testing-library/jest-dom's matcher types onto vitest 5.
//
// jest-dom (≤6.9.x) augments `interface Assertion<T = any>` — the vitest ≤3 signature.
// Vitest 5's Assertion is `Assertion<R extends void | Promise<void>, T>`, and TypeScript
// only merges interfaces whose type-parameter lists match, so the shipped augmentation
// silently never lands and every `toBeInTheDocument()` fails typecheck. The runtime side
// (vitest.setup.ts importing '@testing-library/jest-dom/vitest') is unaffected.
// Delete this file once jest-dom ships a vitest-5-aware vitest.d.ts.

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Assertion<R extends void | Promise<void> = void, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
