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
};

export default nextConfig;
