/**
 * Generating the short-lived code that links a Slack account to a member.
 *
 * Requirements: 2.3, 2.9
 *
 * A module of its own so the distribution can be tested with a byte source
 * the test controls. The previous version lived inside `auth.service.ts` and
 * called `crypto.randomBytes` directly, which left nothing to assert about
 * except the shape of one code — and a biased generator produces
 * correctly-shaped codes every time.
 *
 * It was biased. `bytes[i] % 36` on a byte, and 256 is not a multiple of 36:
 * 256 = 7 × 36 + 4, so the first four characters of the alphabet came up eight
 * times in 256 and the other thirty-two came up seven. About 14% more often.
 * CodeQL had been reporting it as `js/biased-cryptographic-random`.
 */

import crypto from 'crypto';

/** Uppercase alphanumeric: what a person can read off Slack and type back. */
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const CODE_LENGTH = 6;

/**
 * The largest multiple of the alphabet size that fits in a byte.
 *
 * 36 × 7 = 252. Bytes from 252 to 255 are the four that made the start of the
 * alphabet more likely, so they are drawn again rather than folded onto it.
 * Rejection rather than arithmetic: 4 in 256 is discarded, which costs a few
 * extra bytes and buys an exactly uniform code.
 */
const LARGEST_FAIR_BYTE = PAIRING_CODE_ALPHABET.length * 7;

/**
 * The character a byte maps to, or null when it is one of the four that
 * cannot be mapped fairly.
 *
 * Requirement 2.9. Exported because this is where uniformity lives: counting
 * what every byte value produces proves it exactly, where sampling the whole
 * generator only makes it probable.
 */
export function characterForByte(byte: number): string | null {
  if (byte >= LARGEST_FAIR_BYTE) return null;
  return PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length] ?? null;
}

/** Where the bytes come from. Replaced in tests so the distribution is checkable. */
export type ByteSource = (size: number) => Uint8Array;

/**
 * A six-character code, each character equally likely.
 *
 * Takes its randomness so a test can feed it every byte value in turn and
 * count where each one lands — which makes uniformity provable rather than
 * probable.
 *
 * Loops until it has six characters. A source that never yields a usable byte
 * would never finish — `crypto.randomBytes` cannot behave that way, and a test
 * that wants to count the rejected values should use `characterForByte`
 * directly rather than starving this.
 */
export function generatePairingCodeFrom(
  randomBytes: ByteSource = size => crypto.randomBytes(size),
): string {
  let code = '';

  while (code.length < CODE_LENGTH) {
    // Ask for what is still needed, plus a little for the values discarded
    const batch = randomBytes(CODE_LENGTH - code.length + 2);

    for (const byte of batch) {
      if (code.length === CODE_LENGTH) break;

      const character = characterForByte(byte);
      if (character !== null) code += character;
    }
  }

  return code;
}
