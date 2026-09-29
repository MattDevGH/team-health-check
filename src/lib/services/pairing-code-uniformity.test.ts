/**
 * The pairing code is drawn uniformly from its alphabet.
 *
 * Requirements: 2.9, 2.3
 *
 * CodeQL reported `generateRandomCode` as biased. It read `bytes[i] % 36` on a
 * byte, and 256 is not a multiple of 36: 256 = 7 × 36 + 4, so the first four
 * characters of the alphabet came up eight times in 256 and the other
 * thirty-two came up seven — about 14% more often.
 *
 * A statistical test, because the defect is statistical. It asserts the shape
 * of the distribution rather than calling the generator once and looking at
 * the answer, which a biased generator passes every time.
 *
 * The strongest case is the one that needs no statistics at all: feed the
 * generator every byte value in turn and count where each lands. Under the old
 * modulo that is exact and provable rather than probable.
 */

import { describe, it, expect } from 'vitest';

import {
  characterForByte,
  generatePairingCodeFrom,
  PAIRING_CODE_ALPHABET,
} from './pairing-code';

/** A byte source that yields the given values in order, then repeats. */
function bytesFrom(values: number[]): (size: number) => Uint8Array {
  let next = 0;
  return (size: number) => {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      out[i] = values[next % values.length]!;
      next += 1;
    }
    return out;
  };
}

describe('the alphabet', () => {
  it('is 36 characters, which is what makes a byte modulo biased', () => {
    expect(PAIRING_CODE_ALPHABET).toHaveLength(36);
  });

  it('is uppercase alphanumeric, as the code people type', () => {
    expect(PAIRING_CODE_ALPHABET).toMatch(/^[A-Z0-9]+$/);
  });
});

describe('what the generator produces', () => {
  it('is six characters from the alphabet', () => {
    const code = generatePairingCodeFrom(bytesFrom([0]));

    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('uses the whole alphabet', () => {
    // 0..35 map to the 36 characters in order
    const code = generatePairingCodeFrom(bytesFrom([0, 1, 2, 33, 34, 35]));

    expect(code).toBe('ABC789');
  });
});

/**
 * Requirement 2.9
 *
 * Every byte value, counted. Exact rather than probabilistic: with 252 usable
 * values and 36 characters, each character must be reachable from exactly
 * seven of them, and the four values above 251 must be discarded rather than
 * folded onto the start of the alphabet.
 */
describe('every character is equally likely', () => {
  it('maps exactly seven byte values to each character', () => {
    const counts = new Map<string, number>();

    /*
     * Counted through `characterForByte` rather than the generator.
     *
     * Feeding the generator a source that yields only byte 255 would hang it:
     * every value is rejected and it keeps drawing. That is correct for real
     * randomness and wrong for a test, which is why the mapping is exported
     * separately — and it cost a two-minute hang to find out.
     */
    for (let byte = 0; byte <= 255; byte += 1) {
      const character = characterForByte(byte);
      if (character === null) continue;
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }

    const tallies = [...PAIRING_CODE_ALPHABET].map(character => counts.get(character) ?? 0);

    // Under `byte % 36` the first four characters score 8 and the rest 7
    expect(new Set(tallies).size).toBe(1);
    expect(tallies[0]).toBe(7);
  });

  it('discards the four values it cannot use fairly, rather than folding them', () => {
    // These are the ones that made 'A' to 'D' more likely under `% 36`
    expect([252, 253, 254, 255].map(characterForByte)).toEqual([null, null, null, null]);
  });

  it('reaches past a rejected value for a usable one', () => {
    const code = generatePairingCodeFrom(bytesFrom([252, 253, 254, 255, 0]));

    expect(code[0]).toBe('A');
  });

  it('keeps drawing until it has a full code', () => {
    // Mostly unusable, but not entirely — a source with no usable byte at all
    // would loop for ever, which real randomness cannot do
    const code = generatePairingCodeFrom(bytesFrom([255, 255, 255, 1]));

    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });
});

/**
 * A byte source that is random enough to sample with and fixed enough to
 * assert on: a 32-bit LCG, taking the top eight bits because the low ones of
 * an LCG are notoriously patterned.
 *
 * The seed is part of the test. That is the whole point — see below.
 */
function pseudoRandomBytes(seed: number): (size: number) => Uint8Array {
  let state = seed >>> 0;
  return (size: number) => {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      out[i] = state >>> 24;
    }
    return out;
  };
}

describe('over many draws', () => {
  /*
   * This test used to call the real generator and bound the tallies at ±40% of
   * the mean, with a comment promising it "must not fail on an unlucky
   * afternoon". It failed on one: 3,000 characters over 36 symbols means 83.3
   * each with a standard deviation of 9, so the ±40% bound sits 3.7σ out — a
   * little under 1% of runs, and CI runs the suite four times per pull
   * request. It went red on a branch that changed a timeout value.
   *
   * A statistical assertion over unseeded randomness is a coin toss weighted
   * towards passing, and AGENTS.md is blunt about what that is worth. So the
   * sample is fixed: the same 120,000 characters every run, on every machine.
   * It passes always or fails always, which is the only useful behaviour a
   * test has.
   *
   * The bound is ±10% rather than ±40% because it can be. Natural variation in
   * this fixed sample is under 2%; the old modulo puts four characters 12.5%
   * above the mean, which was confirmed by putting the old modulo back and
   * watching this fail on A, B, C and D.
   */
  it('spreads across the alphabet rather than favouring its start', () => {
    // One source across all the draws. Seeding inside the loop makes every
    // code identical, which is a fixed sample of exactly one.
    const source = pseudoRandomBytes(0x5eed);

    const counts = new Map<string, number>();
    for (let draw = 0; draw < 20_000; draw += 1) {
      for (const character of generatePairingCodeFrom(source)) {
        counts.set(character, (counts.get(character) ?? 0) + 1);
      }
    }

    const tallies = [...PAIRING_CODE_ALPHABET].map(character => counts.get(character) ?? 0);
    const mean = tallies.reduce((sum, n) => sum + n, 0) / tallies.length;

    expect(Math.min(...tallies)).toBeGreaterThan(mean * 0.9);
    expect(Math.max(...tallies)).toBeLessThan(mean * 1.1);
  });

  /*
   * The one thing a fixed source cannot check: that the shipped generator is
   * wired to real randomness at all. Its default argument is the only place
   * `crypto.randomBytes` is named, and nothing else in this file executes it.
   *
   * No statistics here, deliberately. Reaching all 36 characters in 3,000
   * draws fails with probability about 1e-36, so this is a test of the wiring
   * rather than of the distribution — the distribution is proved exactly two
   * describes up, over all 256 byte values.
   */
  it('runs on real randomness and reaches every character', () => {
    const seen = new Set<string>();
    for (let draw = 0; draw < 500; draw += 1) {
      for (const character of generatePairingCodeFrom()) seen.add(character);
    }

    expect([...seen].sort().join('')).toBe([...PAIRING_CODE_ALPHABET].sort().join(''));
  });
});
