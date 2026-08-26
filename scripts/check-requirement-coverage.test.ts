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
