# Security Policy

## Reporting a vulnerability

Report privately through GitHub's [Report a vulnerability](https://github.com/MattDevGH/team-health-check/security/advisories/new)
form. Please do not open a public issue for anything exploitable.

Include what you did, what happened, and what you expected. A proof of concept
helps but is not required.

This is a small side project, not a funded product: expect a response in days
rather than hours, and there is no bug bounty.

## What this application handles

Understanding the data helps judge severity:

- **Team health check responses** — scores of 1–5 and optional trend indicators.
  Not sensitive individually, but a team's morale data is confidential to that
  team, and anonymous mode exists so individuals cannot be identified from it.
- **Email addresses** of team members.
- **Authentication tokens** — magic links, session links, session cookies, and
  Slack pairing codes.
- **Slack workspace credentials** — a bot token and signing secret, held in
  environment variables.

There is no payment data, and no special-category personal data.

## Supported versions

The `master` branch only. This project has no release tags and no backport
policy; fixes land on `master`.

## Security model

**Authentication** is passwordless. Magic links are single-use and expire in one
hour; session links are scoped to a session and expire at the earliest of
session close, an existing session expiry, or seven days. Sessions are httpOnly
cookies validated against a `UserSession` record on every protected request.

**Authorisation** is enforced in route handlers, not middleware — Vercel's Edge
runtime cannot run Prisma, so `withAuth` and `authorizeTeamMember` run in
Node.js route handlers instead. `AuthContext.memberId` is the only accepted
identity for browser requests; identity headers are never trusted, and a
contract test scans production sources to keep it that way.

**Slack requests** are verified by HMAC signature with timing-safe comparison
before any processing, and requests older than five minutes are rejected as
replays.

**Anonymity** is enforced server-side: in anonymous mode, aggregates below a
threshold of three responses are suppressed rather than hidden in the UI.

## Known gaps

Stated plainly because a security policy that implies more than exists is worse
than none:

- **No CSRF protection** on authenticated dashboard forms. Session cookies are
  `SameSite=Lax`, which blocks cross-site POST from a form submission, but this
  has not been treated as a designed control.
- **Rate limiting is partial** — magic link requests and session-link validation
  only. Other endpoints are unprotected.
- **Secrets live in environment variables**, with no secrets manager.
- **`TEST_MODE` is dangerous by design.** With `TEST_MODE=true`, the endpoint
  `/api/test/magic-link` returns live sign-in tokens for any address that has
  requested one. It exists so end-to-end tests can authenticate without an
  inbox. It returns 404 unless the flag is exactly `"true"`, and the application
  logs a warning at startup when it is set. **Never set it in a deployed
  environment.**
- **No penetration testing** has been performed.

## Automated checks

| Check | When |
|---|---|
| CodeQL (`security-extended`) | pull requests, pushes to `master`, weekly |
| `npm audit --omit=dev --audit-level=high` | every CI run, blocking |
| Dependabot (npm and GitHub Actions) | weekly |

These catch known-vulnerable dependencies and recognisable code patterns. They
do not find design flaws, broken authorisation logic, or misuse of a correct
API — a review is still the only thing that finds those.
