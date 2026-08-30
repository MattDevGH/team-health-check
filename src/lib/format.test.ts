/**
 * Tests for shared display formatting.
 * Requirements: Manager Experience 3.7
 *
 * TDD: Red phase — these define the behaviour before the helper exists.
 */

import { describe, it, expect } from 'vitest';

import { pluralise } from './format';

describe('pluralise', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralise(1, 'response')).toBe('1 response');
  });

  it('uses the plural for none', () => {
    // "0 response" is the mistake the naive `count === 1 ? …` check avoids and
    // the naive `count > 1 ? …` check makes
    expect(pluralise(0, 'response')).toBe('0 responses');
  });

  it('uses the plural for more than one', () => {
    expect(pluralise(7, 'response')).toBe('7 responses');
  });

  it('accepts an irregular plural', () => {
    expect(pluralise(1, 'person', 'people')).toBe('1 person');
    expect(pluralise(3, 'person', 'people')).toBe('3 people');
  });

  it('leaves the noun alone when only the word is wanted', () => {
    expect(pluralise(2, 'response', undefined, { includeCount: false })).toBe('responses');
    expect(pluralise(1, 'response', undefined, { includeCount: false })).toBe('response');
  });
});
