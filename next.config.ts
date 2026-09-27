import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Origins allowed to request dev-only assets (`/_next/*`, HMR).
   *
   * Development only — Next.js blocks cross-origin dev requests by default, and
   * this setting has no effect on a production build. Needed when Slack reaches
   * the app through a tunnel: the page HTML serves fine over the tunnel host,
   * but without this the client bundle is blocked, React never hydrates, and
   * pages hang on their loading state.
   *
   * Wildcard covers ngrok URLs that change between sessions.
   */
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],

  /**
   * What must not be shipped with a serverless function.
   *
   * Requirements: Feeling Responsive NFR 1.1
   *
   * The build warns that "dynamic filesystem access causes tracing of the
   * whole project" — `resolveSqliteFileUrl` calls `path.resolve(process.cwd(),
   * …)`, and Turbopack's static analysis cannot know what that reaches, so it
   * includes everything.
   *
   * That is not cosmetic. Measured on 2026-09-26, the trace for
   * `/api/auth/logout` — a route that deletes one row — listed **1,089
   * files**: 257 of them the HTML coverage report, 122 the test suite, plus
   * `AGENTS.md`, `AI_CONTEXT.md`, `README.md` and `SECURITY.md`. Every
   * function carried the project's documentation and its own tests.
   *
   * These globs remove what can never be needed at runtime. They do not
   * silence the warning, deliberately: the dynamic access is still there and
   * the day it starts reaching something new, the warning is the only thing
   * that will say so. Narrowing it properly means keeping the local-SQLite
   * path resolver out of code a production route can reach, which is a change
   * to how the client is constructed rather than a configuration line.
   *
   * `**` as the key matches every route.
   */
  outputFileTracingExcludes: {
    "**": [
      "./coverage/**",
      "./e2e/**",
      "./src/tests/**",
      "./playwright-report/**",
      "./test-results/**",
      "./.kiro/**",
      "./docs/**",
      "./*.md",
    ],
  },
};

export default nextConfig;
