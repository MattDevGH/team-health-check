/**
 * Test mock for container-production.
 * Provides in-memory repositories and container for all route handler tests.
 * Vitest automatically picks this up when tests mock '@/lib/container-production'.
 */

import { createInMemoryRepositories } from '../repositories';
import { createContainer } from '../container';

export const repos = createInMemoryRepositories();
export const container = createContainer(repos);
