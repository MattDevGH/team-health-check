/**
 * Checks that a PR description contains at least one requirement reference.
 * Matches patterns: "Requirement 1.1", "Requirement NFR 4.5"
 *
 * Usage: Set PR_DESCRIPTION env var or pipe via stdin.
 * Exit 0 if at least one requirement reference found, exit 1 otherwise.
 *
 * Requirement traceability: documentation-as-code
 */

const REQUIREMENT_PATTERN = /Requirement\s+(NFR\s+)?\d+\.\d+/i;

export function checkRequirementCoverage(description: string): {
  pass: boolean;
  matches: string[];
} {
  const matches = description.match(new RegExp(REQUIREMENT_PATTERN, 'gi')) ?? [];
  return {
    pass: matches.length > 0,
    matches,
  };
}

// CLI entrypoint
if (process.argv[1]?.endsWith('check-requirement-coverage.ts')) {
  const description = process.env.PR_DESCRIPTION ?? '';

  if (!description.trim()) {
    console.error(
      '❌ No PR description provided. Set PR_DESCRIPTION environment variable.'
    );
    process.exit(1);
  }

  const result = checkRequirementCoverage(description);

  if (result.pass) {
    console.log(
      `✅ Found ${result.matches.length} requirement reference(s): ${result.matches.join(', ')}`
    );
    process.exit(0);
  } else {
    console.error(
      '❌ No requirement references found in PR description.\n' +
        '   Please tag at least one requirement affected by this change.\n' +
        '   Examples: "Requirement 1.1", "Requirement NFR 4.5"'
    );
    process.exit(1);
  }
}
