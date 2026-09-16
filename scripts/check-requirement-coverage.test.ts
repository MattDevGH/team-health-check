import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { checkRequirementCoverage } from './check-requirement-coverage';

describe('checkRequirementCoverage', () => {
  describe('passes with valid requirement references', () => {
    it('passes with a standard requirement reference', () => {
      const result = checkRequirementCoverage(
        'This PR implements Requirement 1.1 for team creation.'
      );
      expect(result.pass).toBe(true);
      expect(result.matches).toContain('Requirement 1.1');
    });

    it('passes with an NFR requirement reference', () => {
      const result = checkRequirementCoverage(
        'Performance fix for Requirement NFR 4.5.'
      );
      expect(result.pass).toBe(true);
      expect(result.matches).toContain('Requirement NFR 4.5');
    });

    it('passes with multiple requirement references', () => {
      const result = checkRequirementCoverage(
        'Implements Requirement 1.1 and Requirement 3.2 and Requirement NFR 4.3.'
      );
      expect(result.pass).toBe(true);
      expect(result.matches).toHaveLength(3);
    });

    it('is case-insensitive', () => {
      const result = checkRequirementCoverage(
        'This addresses requirement 2.3 in the spec.'
      );
      expect(result.pass).toBe(true);
      expect(result.matches).toHaveLength(1);
    });

    it('matches requirement in multiline text', () => {
      const description = `## Summary
Some changes here.

## Requirements Affected
Requirement 8.1, Requirement NFR 4.2
`;
      const result = checkRequirementCoverage(description);
      expect(result.pass).toBe(true);
      expect(result.matches).toHaveLength(2);
    });
  });

  describe('a reference qualified by the spec it belongs to', () => {
    /*
     * Requirements: Traceability 1.2, 1.3
     *
     * AGENTS.md now requires every reference outside the original spec to name
     * it — "Explaining Itself 4.1", not "4.1", because a bare number means the
     * default spec and resolving it against the wrong one is the failure the
     * rule exists to prevent.
     *
     * The gate never learned that. It accepted only `Requirement 1.1`, so a
     * description following the rule failed the check, and following the check
     * meant writing a number that claims the wrong spec. Two pull requests hit
     * it on 2026-09-16.
     */

    it('accepts a reference naming its spec', () => {
      const result = checkRequirementCoverage(
        'Requirements: Explaining Itself 4.1',
      );

      expect(result.pass).toBe(true);
    });

    it('accepts the plural-with-colon form the commits use', () => {
      const result = checkRequirementCoverage(
        'Requirements: Knowing What Happened 1.4, 1.6',
      );

      expect(result.pass).toBe(true);
    });

    it('accepts a spec-qualified NFR', () => {
      const result = checkRequirementCoverage('Requirement Explaining Itself NFR 1.1');

      expect(result.pass).toBe(true);
    });

    it('still accepts a bare number, which means the original spec', () => {
      expect(checkRequirementCoverage('Requirement 1.1').pass).toBe(true);
    });

    it('does not accept prose that merely runs into a version number', () => {
      // The gate checks for a shape. A shape that matches any sentence
      // containing a decimal would check nothing at all
      expect(
        checkRequirementCoverage('This requirement work follows the Next.js 16.2 upgrade.').pass,
      ).toBe(false);
    });
  });

  describe('the script CI actually runs', () => {
    /*
     * CI runs `check-requirement-coverage.sh`; these tests exercise
     * `check-requirement-coverage.ts`. Two implementations of one rule, and
     * only the unused one was tested — so the tested rule and the enforced
     * rule could differ without anything going red, which is exactly how the
     * qualified-reference gap survived.
     *
     * Rather than test the shell separately, the shell is compared against the
     * implementation these tests cover, on the cases that matter.
     */
    const shell = path.resolve(__dirname, 'check-requirement-coverage.sh');

    function runShell(description: string): boolean {
      try {
        execFileSync('bash', [shell], {
          env: { ...process.env, PR_DESCRIPTION: description },
          stdio: 'pipe',
        });
        return true;
      } catch {
        return false;
      }
    }

    it.each([
      'Requirements: Explaining Itself 4.1',
      'Requirements: Knowing What Happened 1.4, 1.6',
      'Requirement NFR 4.5',
      'Requirement 1.1',
      'Fixed a bug in the login page.',
      'Updated requirements documentation.',
      'Addresses Requirement 1 items.',
    ])('agrees with the tested implementation on: %s', description => {
      expect(runShell(description)).toBe(checkRequirementCoverage(description).pass);
    });
  });

  describe('fails without valid requirement references', () => {
    it('fails with empty description', () => {
      const result = checkRequirementCoverage('');
      expect(result.pass).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('fails with no requirement mention at all', () => {
      const result = checkRequirementCoverage(
        'Fixed a bug in the login page.'
      );
      expect(result.pass).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('fails with partial match (no number)', () => {
      const result = checkRequirementCoverage(
        'This is related to Requirement handling.'
      );
      expect(result.pass).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('fails when only "requirement" word appears without proper format', () => {
      const result = checkRequirementCoverage(
        'Updated requirements documentation.'
      );
      expect(result.pass).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('fails with number but wrong format (no dot)', () => {
      const result = checkRequirementCoverage(
        'Addresses Requirement 1 items.'
      );
      expect(result.pass).toBe(false);
      expect(result.matches).toHaveLength(0);
    });
  });
});
