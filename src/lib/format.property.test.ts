/**
 * Property Tests for display formatting.
 *
 * Feature: manager-experience, Property 3: singular exactly when the count is 1
 *
 * **Validates: Requirement 3.7**
 *
 * For any non-negative count, the rendered noun is singular if and only if the
 * count is one.
 *
 * The example tests cover 0, 1 and 7. This covers every other count, including
 * the ones a real team eventually produces. Two plausible wrong implementations
 * survive a suite that only checks 0, 1 and 7 in isolation but not both
 * directions of the "if and only if": `count > 1` renders "0 response", and
 * `count !== 1` is right for the noun but easy to invert.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { pluralise } from './format';

describe('Property 3: singular exactly when the count is one', () => {
  it('renders the singular noun if and only if the count is one', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), count => {
        const rendered = pluralise(count, 'response');
        const endsWithSingular = rendered.endsWith(' response');

        expect(endsWithSingular).toBe(count === 1);
      }),
    );
  });

  it('always leads with the count it was given', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), count => {
        expect(pluralise(count, 'response').startsWith(`${count} `)).toBe(true);
      }),
    );
  });

  it('uses the supplied irregular plural for every count except one', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), count => {
        const rendered = pluralise(count, 'person', 'people');

        expect(rendered.endsWith(count === 1 ? ' person' : ' people')).toBe(true);
      }),
    );
  });
});
