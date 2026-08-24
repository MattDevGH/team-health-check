/**
 * Unit tests for the on-demand health check prompt service.
 *
 * Covers the `/healthcheck` slash command eligibility contract:
 * Slack linkage resolution, open-session detection, cadence-aware selection of
 * outstanding questions, and an actionable session link.
 *
 * Requirements: Integration 7.4, 8.4; Original 5.15, 5.16
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories } from '@/lib/repositories';
import type { Repositories } from '@/lib/repositories';
import { createQuestionSelectionService } from '@/lib/services/question-selection.service';
import { createHealthCheckPromptService } from '@/lib/services/health-check-prompt.service';
import type { HealthCheckPromptService } from '@/lib/services/health-check-prompt.service';
import type { Team, TeamMember, HealthCheckSession } from '@/lib/repositories/entities';

const APP_URL = 'https://health.example.com';

describe('HealthCheckPromptService.resolveOnDemandPrompt', () => {
  let repos: Repositories;
  let service: HealthCheckPromptService;

  function build(now?: () => Date): HealthCheckPromptService {
    return createHealthCheckPromptService({
      slackIdentityLinkRepo: repos.slackIdentityLink,
      teamMemberRepo: repos.teamMember,
      sessionRepo: repos.session,
      questionRepo: repos.question,
      responseRepo: repos.response,
      sessionLinkRepo: repos.sessionLink,
      availabilityRepo: repos.availability,
      questionSelection: createQuestionSelectionService({
        questionRepo: repos.question,
        responseRepo: repos.response,
        sessionRepo: repos.session,
      }),
      appUrl: APP_URL,
      now,
    });
  }

  async function seedLinkedMember(options?: {
    cadencePreference?: string;
    slackUserId?: string;
  }): Promise<{ team: Team; member: TeamMember }> {
    const team = await repos.team.create({ name: 'Prompt Team' });
    const created = await repos.teamMember.create({
      teamId: team.id,
      name: 'Alice',
      email: 'alice@example.com',
    });
    const member = await repos.teamMember.update(created.id, {
      cadencePreference: options?.cadencePreference ?? 'weekly',
    });
    await repos.slackIdentityLink.create({
      memberId: member.id,
      slackUserId: options?.slackUserId ?? 'ULINKED',
    });
    return { team, member };
  }

  async function openSessionWithLink(
    team: Team,
    member: TeamMember,
  ): Promise<HealthCheckSession> {
    const session = await repos.session.create({ teamId: team.id, status: 'open' });
    await repos.sessionLink.create({
      token: 'existing-token',
      memberId: member.id,
      sessionId: session.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return session;
  }

  beforeEach(() => {
    repos = createInMemoryRepositories();
    service = build();
  });

  it('reports an unlinked Slack user when no identity link exists', async () => {
    const result = await service.resolveOnDemandPrompt('UNKNOWN');

    expect(result).toEqual({ kind: 'unlinked' });
  });

  it('reports an unlinked Slack user when the linked member no longer exists', async () => {
    await repos.slackIdentityLink.create({
      memberId: 'deleted-member',
      slackUserId: 'UORPHAN',
    });

    const result = await service.resolveOnDemandPrompt('UORPHAN');

    expect(result).toEqual({ kind: 'unlinked' });
  });

  it('reports no active session when the member team has no open session', async () => {
    const { team } = await seedLinkedMember();
    await repos.session.create({ teamId: team.id, status: 'closed' });

    const result = await service.resolveOnDemandPrompt('ULINKED');

    expect(result).toEqual({ kind: 'no_active_session' });
  });

  it('returns every question with the member session link for a weekly member', async () => {
    const { team, member } = await seedLinkedMember();
    const session = await openSessionWithLink(team, member);

    const result = await service.resolveOnDemandPrompt('ULINKED');

    expect(result.kind).toBe('prompt');
    if (result.kind !== 'prompt') return;
    expect(result.sessionId).toBe(session.id);
    expect(result.questions.map(q => q.id)).toEqual([
      'q-delivering-value',
      'q-team-collaboration',
      'q-ease-of-delivery',
      'q-learning-improving',
      'q-psychological-safety',
    ]);
    expect(result.sessionLinkUrl).toBe(`${APP_URL}/session/existing-token`);
    expect(result.awayUntil).toBeNull();
  });

  it('returns only outstanding questions in display order for a weekly member', async () => {
    const { team, member } = await seedLinkedMember();
    const session = await openSessionWithLink(team, member);
    await repos.response.upsert({
      memberId: member.id,
      sessionId: session.id,
      questionId: 'q-team-collaboration',
      score: 4,
    });
    await repos.response.upsert({
      memberId: member.id,
      sessionId: session.id,
      questionId: 'q-delivering-value',
      score: 3,
    });

    const result = await service.resolveOnDemandPrompt('ULINKED');

    expect(result.kind).toBe('prompt');
    if (result.kind !== 'prompt') return;
    expect(result.questions.map(q => q.id)).toEqual([
      'q-ease-of-delivery',
      'q-learning-improving',
      'q-psychological-safety',
    ]);
  });

  it('reports all answered once the member has responded to every question', async () => {
    const { team, member } = await seedLinkedMember();
    const session = await openSessionWithLink(team, member);
    for (const question of await repos.question.findAll()) {
      await repos.response.upsert({
        memberId: member.id,
        sessionId: session.id,
        questionId: question.id,
        score: 3,
      });
    }

    const result = await service.resolveOnDemandPrompt('ULINKED');

    expect(result).toEqual({
      kind: 'all_answered',
      sessionLinkUrl: `${APP_URL}/session/existing-token`,
    });
  });

  it('narrows a micro-pulse member to a weighted subset of outstanding questions', async () => {
    const { team, member } = await seedLinkedMember({ cadencePreference: 'micro_pulse' });
    await openSessionWithLink(team, member);

    const result = await service.resolveOnDemandPrompt('ULINKED');

    expect(result.kind).toBe('prompt');
    if (result.kind !== 'prompt') return;
    expect(result.questions).toHaveLength(1);
    const allIds = (await repos.question.findAll()).map(q => q.id);
    expect(allIds).toContain(result.questions[0].id);
  });

  it('creates and persists a session link when the member has none', async () => {
    const { team, member } = await seedLinkedMember();
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const result = await service.resolveOnDemandPrompt('ULINKED');

    expect(result.kind).toBe('prompt');
    if (result.kind !== 'prompt') return;
    const persisted = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
    expect(persisted).not.toBeNull();
    expect(result.sessionLinkUrl).toBe(`${APP_URL}/session/${persisted?.token}`);

    // A second invocation reuses the same link rather than minting another
    const again = await service.resolveOnDemandPrompt('ULINKED');
    expect(again.kind === 'prompt' && again.sessionLinkUrl).toBe(result.sessionLinkUrl);
  });

  it('still prompts a member who is marked away, reporting the away end date', async () => {
    const { team, member } = await seedLinkedMember();
    await openSessionWithLink(team, member);
    const now = new Date('2026-08-24T10:00:00.000Z');
    const awayUntil = new Date('2026-08-28T00:00:00.000Z');
    await repos.availability.create({
      memberId: member.id,
      awayFrom: new Date('2026-08-20T00:00:00.000Z'),
      awayUntil,
    });

    const result = await build(() => now).resolveOnDemandPrompt('ULINKED');

    expect(result.kind).toBe('prompt');
    if (result.kind !== 'prompt') return;
    expect(result.questions).toHaveLength(5);
    expect(result.awayUntil).toEqual(awayUntil);
  });
});
