/**
 * Checking that a requirement reference points at a requirement.
 *
 * Requirements: Traceability 1.1, 1.2, 1.3
 *
 * Written after a citation to "Manager Experience 5.x" reached a pull request
 * description. The requirement had never existed, and nothing would have caught
 * it but a reader who happened to look — the coverage gate only checked that a
 * requirement was *mentioned*, not that it was real.
 *
 * A citation nobody can follow is worse than none, because it reads as though
 * somebody checked.
 */

import { describe, expect, it } from 'vitest';

import {
  buildIndex,
  parseReferences,
  resolve,
  describeProblem,
  DEFAULT_SPEC,
} from '@/lib/requirements/reference-index';

const original = {
  slug: DEFAULT_SPEC,
  text: [
    '### Requirement 10: Response Data Integrity',
    '',
    '#### Acceptance Criteria',
    '',
    '1. First.',
    '2. Second.',
    '3. Third.',
    '4. Fourth.',
    '5. Fifth.',
    '',
    '### Requirement 18: Team Configuration Audit Log',
    '',
    '1. First.',
    '2. Second.',
    '',
    '### NFR 2: Accessibility',
    '',
    '1. First.',
  ].join('\n'),
};

const otherSpec = {
  slug: 'integration-hardening',
  text: ['### Requirement 10: End-to-End Acceptance Test', '', '1. a', '2. b', '3. c', '4. d', '5. e', '6. f'].join(
    '\n',
  ),
};

const index = buildIndex([original, otherSpec]);

/** The first problem with a reference line, or null if every reference resolves. */
function check(line: string) {
  for (const reference of parseReferences(line)) {
    const problem = resolve(index, reference);
    if (problem) return problem;
  }
  return null;
}

describe('parseReferences', () => {
  it('reads a bare reference as the original spec', () => {
    expect(parseReferences('Requirements: 18.2')).toEqual([
      { spec: DEFAULT_SPEC, requirement: '18', criterion: 2, raw: '18.2' },
    ]);
  });

  it('reads a qualified reference as the spec it names', () => {
    expect(parseReferences('Requirements: Explaining Itself 1.4')[0]).toMatchObject({
      spec: 'explaining-itself',
      requirement: '1',
      criterion: 4,
    });
  });

  it('reads several on one line', () => {
    expect(parseReferences('Requirements: 10.2, 10.5, 18.1')).toHaveLength(3);
  });

  it('reads the ones separated by semicolons, as the codebase writes them', () => {
    const refs = parseReferences('Requirements: 4.6; Integration 10.2');

    expect(refs[0]).toMatchObject({ spec: DEFAULT_SPEC, requirement: '4' });
    expect(refs[1]).toMatchObject({ spec: 'integration-hardening', requirement: '10' });
  });

  it('keeps NFR with the requirement rather than reading it as a spec', () => {
    expect(parseReferences('Requirements: NFR 2.1')[0]).toMatchObject({
      spec: DEFAULT_SPEC,
      requirement: 'NFR 2',
      criterion: 1,
    });
  });

  it('reads a spec-qualified NFR', () => {
    expect(parseReferences('Requirements: Explaining Itself NFR 2.1')[0]).toMatchObject({
      spec: 'explaining-itself',
      requirement: 'NFR 2',
      criterion: 1,
    });
  });

  it('understands Original and Integration, which predate the convention', () => {
    expect(parseReferences('Requirements: Original 18.1')[0].spec).toBe(DEFAULT_SPEC);
    expect(parseReferences('Requirements: Integration 10.6')[0].spec).toBe('integration-hardening');
  });

  it('finds nothing on a line with no references', () => {
    expect(parseReferences(' * Some ordinary sentence about the code.')).toEqual([]);
  });
});

describe('resolve', () => {
  it('accepts a reference to a requirement that exists', () => {
    expect(check('Requirements: 18.2')).toBeNull();
  });

  it('accepts an NFR that exists', () => {
    expect(check('Requirements: NFR 2.1')).toBeNull();
  });

  it('rejects a criterion beyond the ones listed', () => {
    /*
     * The failure that actually happened. `10.6` was cited ten times: the
     * original spec's Requirement 10 has five criteria, and the reference meant
     * a different spec entirely.
     */
    expect(check('Requirements: 10.6')).toMatchObject({ kind: 'unknown-criterion', criteria: 5 });
  });

  it('accepts the same number once it says which spec it means', () => {
    // Where it resolves, because that spec's Requirement 10 has six criteria
    expect(check('Requirements: Integration 10.6')).toBeNull();
  });

  it('rejects a requirement the spec does not have', () => {
    expect(check('Requirements: 99.1')).toMatchObject({ kind: 'unknown-requirement' });
  });

  it('rejects a spec that does not exist', () => {
    // "Manager Experience 5.x" — invented, and it reached a pull request
    expect(check('Requirements: Made Up Spec 1.1')).toMatchObject({ kind: 'unknown-spec' });
  });

  it('rejects the second reference on a line when the first is fine', () => {
    // A line is only as good as its worst citation
    expect(check('Requirements: 18.1, 10.6')).toMatchObject({ kind: 'unknown-criterion' });
  });
});

describe('describeProblem', () => {
  it('says which file, which reference, and what is wrong with it', () => {
    const problem = check('Requirements: 10.6');
    expect(problem).not.toBeNull();

    const message = describeProblem(problem!, 'src/lib/thing.ts');

    expect(message).toContain('src/lib/thing.ts');
    expect(message).toContain('10.6');
    expect(message).toContain('5 acceptance criteria');
  });

  it('names the spec it could not find', () => {
    const problem = check('Requirements: Made Up Spec 1.1');

    expect(describeProblem(problem!, 'f.ts')).toContain('made-up-spec');
  });
});

describe('buildIndex', () => {
  it('counts the acceptance criteria under each requirement', () => {
    const built = buildIndex([original]);

    expect(built.specs.get(DEFAULT_SPEC)?.get('10')).toBe(5);
    expect(built.specs.get(DEFAULT_SPEC)?.get('18')).toBe(2);
  });

  it('keeps NFRs apart from requirements sharing a number', () => {
    // NFR 2 and Requirement 2 are different things, and a reference says which
    const built = buildIndex([original]);

    expect(built.specs.get(DEFAULT_SPEC)?.get('NFR 2')).toBe(1);
    expect(built.specs.get(DEFAULT_SPEC)?.has('2')).toBe(false);
  });

  it('stops counting at the next requirement rather than running on', () => {
    const built = buildIndex([original]);

    expect(built.specs.get(DEFAULT_SPEC)?.get('18')).toBe(2);
  });
});

describe('a spec named once, for a list', () => {
  /*
   * "Integration 10.2, 10.5, 10.6" is how a person writes three references to
   * one spec, and how the next person reads them. Attributing only the first
   * would make the convention unusable: the alternative is repeating the spec
   * name three times, which nobody will do and a reviewer would not enforce.
   */
  it('carries the spec across the numbers that follow it', () => {
    const refs = parseReferences('Requirements: Integration 10.2, 10.5, 10.6');

    expect(refs.map(r => r.spec)).toEqual([
      'integration-hardening',
      'integration-hardening',
      'integration-hardening',
    ]);
  });

  it('starts from the original spec until a spec is named', () => {
    const refs = parseReferences('Requirements: 4.6, 4.7, Integration 10.2');

    expect(refs.map(r => r.spec)).toEqual([
      DEFAULT_SPEC,
      DEFAULT_SPEC,
      'integration-hardening',
    ]);
  });

  it('stops carrying at a semicolon, which is how the codebase groups them', () => {
    // "Original 4.6; Integration 10.2" reads as two groups, and a semicolon is
    // the only punctuation the existing citations use that way
    const refs = parseReferences('Requirements: Integration 10.2; 4.6');

    expect(refs.map(r => r.spec)).toEqual(['integration-hardening', DEFAULT_SPEC]);
  });

  it('lets a second spec take over mid-list', () => {
    const refs = parseReferences('Requirements: Integration 10.2, Explaining Itself 1.4, 1.5');

    expect(refs.map(r => r.spec)).toEqual([
      'integration-hardening',
      'explaining-itself',
      'explaining-itself',
    ]);
  });
});
