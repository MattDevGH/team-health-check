/**
 * Guards the app's public metadata against leftover scaffolding.
 *
 * This is user-visible: Slack unfurls every session link we send and renders the
 * page title and description. Task 24.5 acceptance found "Generated from
 * nextjs-fullstack-starter" being shown to members in Slack.
 *
 * Requirements: 11.1, 11.2
 */

import { describe, it, expect } from 'vitest';

import { metadata } from '@/app/layout';

describe('app metadata', () => {
  it('names the product rather than the starter template', () => {
    expect(metadata.title).toBe('Team Health Check');
  });

  it('describes the product without scaffolding references', () => {
    const description = String(metadata.description ?? '');

    expect(description.length).toBeGreaterThan(0);
    expect(description.toLowerCase()).not.toContain('nextjs-fullstack-starter');
    expect(description.toLowerCase()).not.toContain('generated from');
  });
});
