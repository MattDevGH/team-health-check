#!/usr/bin/env bash
# CI script: Verifies the PR description contains at least one requirement reference.
# Matches: "Requirement 1.1", "Requirement NFR 4.5" (case-insensitive)
#
# Usage: PR_DESCRIPTION="..." ./scripts/check-requirement-coverage.sh
# Or in CI: extracts from $PR_BODY environment variable set by GitHub Actions.

set -euo pipefail

DESCRIPTION="${PR_DESCRIPTION:-${PR_BODY:-}}"

if [ -z "$DESCRIPTION" ]; then
  echo "❌ No PR description provided. Set PR_DESCRIPTION or PR_BODY environment variable."
  exit 1
fi

# Case-insensitive grep for requirement pattern
MATCHES=$(echo "$DESCRIPTION" | grep -ioE 'Requirement\s+(NFR\s+)?[0-9]+\.[0-9]+' || true)

if [ -z "$MATCHES" ]; then
  echo "❌ No requirement references found in PR description."
  echo "   Please tag at least one requirement affected by this change."
  echo "   Examples: \"Requirement 1.1\", \"Requirement NFR 4.5\""
  exit 1
fi

COUNT=$(echo "$MATCHES" | wc -l | tr -d ' ')
echo "✅ Found $COUNT requirement reference(s):"
echo "$MATCHES"
exit 0
