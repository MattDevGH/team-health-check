/**
 * Server startup hook.
 *
 * Next.js calls `register` once when a server instance is initiated, and it
 * must complete before the server is ready to handle requests — which makes it
 * the one place a misconfiguration can stop a deployment rather than surface as
 * a user's error later.
 *
 * It is not called during `next build`, which matters: the build imports every
 * route with `NODE_ENV=production` to collect page data, so the same checks at
 * module load fail the build instead of the deployment.
 *
 * Requirements: Deployment 2.3
 */

import { assertProductionReady } from '@/lib/startup-guards';

export function register(): void {
  assertProductionReady(process.env);
}
