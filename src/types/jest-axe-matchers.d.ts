/**
 * `toHaveNoViolations`, declared against Vitest's own matcher interface.
 *
 * Requirements: NFR accessibility criteria (the axe tier)
 *
 * `@types/jest-axe` augments `jest` and `@jest/expect` and has never known
 * about Vitest. Until Vitest 5 that did not matter: its `Assertion` type was
 * loose enough, and the ambient `jest` namespace from `@types/jest` filled the
 * gap. Vitest 5 tightened `Assertion<R, T>`, and 21 axe assertions across the
 * suite stopped type-checking in one go.
 *
 * Declaring it here rather than loosening the matcher's type, or reaching for
 * `as any`, keeps a misuse a compile error: `toHaveNoViolations` takes no
 * arguments and this says so.
 *
 * The matcher itself is still registered at runtime by each test file's
 * `expect.extend(toHaveNoViolations)` — this file is types only, and a
 * declaration with no registration would be the worst of both.
 */

import 'vitest';

declare module 'vitest' {
  interface Assertion<R = void> {
    toHaveNoViolations(): R;
  }

  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
