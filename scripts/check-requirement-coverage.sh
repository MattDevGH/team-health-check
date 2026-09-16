#!/usr/bin/env bash
# CI script: Verifies the PR description contains at least one requirement reference.
# Matches: "Requirement 1.1", "Requirement NFR 4.5", and a reference naming the
# spec it belongs to: "Requirements: Explaining Itself 4.1".
#
# This must agree with scripts/check-requirement-coverage.ts, which is the one
# with tests. A test runs this script and compares the two, because CI runs the
# shell and the tests exercised the TypeScript — so the tested rule and the
# enforced rule could differ without anything going red, which is how the
# spec-qualified form stayed unsupported.
#
# The spec name must be Title Case. That is what stops this matching any
# sentence containing a decimal, so the -i flag is deliberately gone.
#
# Usage: PR_DESCRIPTION="..." ./scripts/check-requirement-coverage.sh
# Or in CI: extracts from $PR_BODY environment variable set by GitHub Actions.

set -euo pipefail

DESCRIPTION="${PR_DESCRIPTION:-${PR_BODY:-}}"

if [ -z "$DESCRIPTION" ]; then
  echo "❌ No PR description provided. Set PR_DESCRIPTION or PR_BODY environment variable."
  exit 1
fi

MATCHES=$(echo "$DESCRIPTION" | grep -oE '[Rr]equirements?:?[[:space:]]+([A-Z][A-Za-z-]*[[:space:]]+){0,4}(NFR[[:space:]]+)?[0-9]+\.[0-9]+' || true)

if [ -z "$MATCHES" ]; then
  echo "❌ No requirement references found in PR description."
  echo "   Please tag at least one requirement affected by this change."
  echo "   Examples: \"Requirement 1.1\", \"Requirement NFR 4.5\","
  echo "             \"Requirements: Explaining Itself 4.1\""
  exit 1
fi

COUNT=$(echo "$MATCHES" | wc -l | tr -d ' ')
echo "✅ Found $COUNT requirement reference(s):"
echo "$MATCHES"
exit 0
