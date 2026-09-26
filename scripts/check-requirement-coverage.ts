/**
 * Checks that a PR description contains at least one requirement reference.
 *
 * Matches "Requirement 1.1", "Requirement NFR 4.5", and a reference that names
 * the spec it belongs to: "Requirements: Explaining Itself 4.1".
 *
 * Usage: Set PR_DESCRIPTION env var or pipe via stdin.
 * Exit 0 if at least one requirement reference found, exit 1 otherwise.
 *
 * Requirements: Traceability 1.2, 1.3
 *
 * The spec-qualified form was added on 2026-09-16. AGENTS.md requires a
 * reference outside the original spec to name it — a bare number means the
 * default spec, and resolving one against the wrong spec is the failure that
 * rule exists to prevent — but this gate had never learned the form. Following
 * the rule failed the check, and passing the check meant writing a number that
 * claimed the wrong spec. Two pull requests hit it in one afternoon.
 *
 * The spec name must be Title Case, which is what keeps this from matching any
 * sentence containing a decimal: "this requirement work follows the Next.js
 * 16.2 upgrade" is prose, not a citation.
 */

const REQUIREMENT_PATTERN = /[Rr]equirements?:?\s+(?:[A-Z][A-Za-z-]*\s+){0,4}(?:NFR\s+)?\d+\.\d+/;

export function checkRequirementCoverage(description: string): {
  pass: boolean;
  matches: string[];
} {
  const matches = description.match(new RegExp(REQUIREMENT_PATTERN, 'g')) ?? [];
  return {
    pass: matches.length > 0,
    matches,
  };
}

/** Where the CLI writes. Replaced in tests so nothing is spawned. */
export interface CliOutput {
  out(message: string): void;
  err(message: string): void;
}

/**
 * The gate exactly as CI runs it, returning the exit code rather than calling
 * `process.exit`, so a test can exercise the enforced path in process.
 *
 * Until 2026-09-25 CI ran `check-requirement-coverage.sh` while these tests
 * covered the TypeScript — two implementations of one rule, with a parity test
 * spanning them, and a dependency on `bash` that a Windows environment did not
 * satisfy. The shell is gone; this is the only implementation now, so the
 * tested rule and the enforced rule cannot drift apart.
 */
export function runRequirementCoverageCli(
  description: string,
  output: CliOutput = { out: console.log, err: console.error },
): number {
  if (!description.trim()) {
    output.err('❌ No PR description provided. Set PR_DESCRIPTION environment variable.');
    return 1;
  }

  const result = checkRequirementCoverage(description);

  if (result.pass) {
    output.out(
      `✅ Found ${result.matches.length} requirement reference(s): ${result.matches.join(', ')}`,
    );
    return 0;
  }

  output.err(
    '❌ No requirement references found in PR description.\n' +
      '   Please tag at least one requirement affected by this change.\n' +
      '   Examples: "Requirement 1.1", "Requirement NFR 4.5",\n' +
      '             "Requirements: Explaining Itself 4.1"',
  );
  return 1;
}

// CLI entrypoint
if (process.argv[1]?.endsWith('check-requirement-coverage.ts')) {
  process.exit(runRequirementCoverageCli(process.env.PR_DESCRIPTION ?? ''));
}
