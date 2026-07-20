/**
 * Container wiring verification tests.
 * Task 27.1: Wire production container to all route handlers.
 *
 * Validates:
 * 1. The container exports all expected services
 * 2. No service file directly imports Prisma
 * 3. Route handlers import from the container (not directly constructing repos)
 *
 * Requirements: (architecture)
 */

import { describe, it, expect } from 'vitest';
import { createContainer } from '@/lib/container';
import type { Container } from '@/lib/container';
import { createInMemoryRepositories } from '@/lib/repositories';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

describe('Production container wiring', () => {
  describe('Container exports all expected services', () => {
    const repos = createInMemoryRepositories();
    const container: Container = createContainer(repos);

    it('exports team service', () => {
      expect(container.team).toBeDefined();
      expect(typeof container.team.create).toBe('function');
    });

    it('exports session service', () => {
      expect(container.session).toBeDefined();
      expect(typeof container.session.open).toBe('function');
    });

    it('exports response service', () => {
      expect(container.response).toBeDefined();
      expect(typeof container.response.upsert).toBe('function');
    });

    it('exports auth service', () => {
      expect(container.auth).toBeDefined();
      expect(typeof container.auth.validateSessionLink).toBe('function');
    });

    it('exports role service', () => {
      expect(container.role).toBeDefined();
      expect(typeof container.role.assignRole).toBe('function');
    });

    it('exports permission service', () => {
      expect(container.permission).toBeDefined();
      expect(typeof container.permission.requireRole).toBe('function');
    });

    it('exports genesis service', () => {
      expect(container.genesis).toBeDefined();
      expect(typeof container.genesis.executeGenesis).toBe('function');
    });

    it('exports trend service', () => {
      expect(container.trend).toBeDefined();
      expect(typeof container.trend.getSessionAverages).toBe('function');
    });

    it('exports schedule service', () => {
      expect(container.schedule).toBeDefined();
      expect(typeof container.schedule.configure).toBe('function');
    });

    it('exports audit log service', () => {
      expect(container.auditLog).toBeDefined();
      expect(typeof container.auditLog.log).toBe('function');
    });

    it('exports privacy service', () => {
      expect(container.privacy).toBeDefined();
      expect(typeof container.privacy.getMode).toBe('function');
    });

    it('exports availability service', () => {
      expect(container.availability).toBeDefined();
      expect(typeof container.availability.markAway).toBe('function');
    });

    it('exports streak service', () => {
      expect(container.streak).toBeDefined();
      expect(typeof container.streak.calculate).toBe('function');
    });

    it('exports question selection service', () => {
      expect(container.questionSelection).toBeDefined();
    });
  });

  describe('No service imports Prisma directly', () => {
    it('service files do not import from @prisma or prisma client', () => {
      const servicesDir = path.resolve(__dirname, '../../lib/services');
      const serviceFiles = readdirSync(servicesDir).filter(f => f.endsWith('.ts'));

      const violations: string[] = [];

      for (const file of serviceFiles) {
        const filePath = path.join(servicesDir, file);
        const content = readFileSync(filePath, 'utf-8');

        // Check for direct Prisma imports
        if (
          content.includes("from '@prisma/") ||
          content.includes('from "@prisma/') ||
          content.includes("from '@/lib/prisma'") ||
          content.includes('from "@/lib/prisma"') ||
          content.includes("from '@/generated/prisma'") ||
          content.includes('from "@/generated/prisma"')
        ) {
          violations.push(file);
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('Route handlers use production container', () => {
    it('no route handler imports createInMemoryRepositories', () => {
      const apiDir = path.resolve(__dirname, '../../app/api');
      const violations: string[] = [];

      function walkRoutes(dir: string): void {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walkRoutes(fullPath);
          } else if (entry === 'route.ts') {
            const content = readFileSync(fullPath, 'utf-8');
            if (content.includes('createInMemoryRepositories')) {
              const relative = path.relative(apiDir, fullPath);
              violations.push(relative);
            }
          }
        }
      }

      walkRoutes(apiDir);
      expect(violations).toEqual([]);
    });

    it('route handlers import from container module', () => {
      const apiDir = path.resolve(__dirname, '../../app/api');
      const missingContainer: string[] = [];

      function walkRoutes(dir: string): void {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walkRoutes(fullPath);
          } else if (entry === 'route.ts') {
            const content = readFileSync(fullPath, 'utf-8');
            // Skip routes that don't use services (e.g., slack/events, items placeholder)
            const usesServices = content.includes('container.');
            if (usesServices && !content.includes("from '@/lib/container")) {
              const relative = path.relative(apiDir, fullPath);
              missingContainer.push(relative);
            }
          }
        }
      }

      walkRoutes(apiDir);
      expect(missingContainer).toEqual([]);
    });
  });
});
