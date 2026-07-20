/**
 * Unit tests for in-memory SlackIdentityLinkRepository.
 * Requirements: 7.1, 7.2, 7.3
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { InMemorySlackIdentityLinkRepository } from './slack-identity-link.repository';
import type { SlackIdentityLinkRepository } from '../types';

describe('InMemorySlackIdentityLinkRepository', () => {
  let repo: SlackIdentityLinkRepository;

  beforeEach(() => {
    repo = new InMemorySlackIdentityLinkRepository();
  });

  describe('create', () => {
    it('creates a link with generated id and timestamps', async () => {
      const link = await repo.create({ memberId: 'member-1', slackUserId: 'U12345' });

      expect(link.id).toBeDefined();
      expect(link.memberId).toBe('member-1');
      expect(link.slackUserId).toBe('U12345');
      expect(link.createdAt).toBeInstanceOf(Date);
    });

    it('creates links with unique ids', async () => {
      const link1 = await repo.create({ memberId: 'member-1', slackUserId: 'U111' });
      const link2 = await repo.create({ memberId: 'member-2', slackUserId: 'U222' });

      expect(link1.id).not.toBe(link2.id);
    });
  });

  describe('findByMemberId', () => {
    it('returns the link for an existing memberId', async () => {
      const created = await repo.create({ memberId: 'member-1', slackUserId: 'U12345' });
      const found = await repo.findByMemberId('member-1');

      expect(found).toEqual(created);
    });

    it('returns null for a non-existent memberId', async () => {
      const found = await repo.findByMemberId('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findBySlackUserId', () => {
    it('returns the link for an existing slackUserId', async () => {
      const created = await repo.create({ memberId: 'member-1', slackUserId: 'U12345' });
      const found = await repo.findBySlackUserId('U12345');

      expect(found).toEqual(created);
    });

    it('returns null for a non-existent slackUserId', async () => {
      const found = await repo.findBySlackUserId('U_NON_EXISTENT');
      expect(found).toBeNull();
    });
  });

  describe('upsertByMemberId', () => {
    it('creates a new link when none exists for the memberId', async () => {
      const result = await repo.upsertByMemberId('member-1', 'U12345');

      expect(result.id).toBeDefined();
      expect(result.memberId).toBe('member-1');
      expect(result.slackUserId).toBe('U12345');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('updates the slackUserId when a link already exists for the memberId', async () => {
      const original = await repo.upsertByMemberId('member-1', 'U_OLD');
      const updated = await repo.upsertByMemberId('member-1', 'U_NEW');

      expect(updated.id).toBe(original.id);
      expect(updated.memberId).toBe('member-1');
      expect(updated.slackUserId).toBe('U_NEW');
    });

    it('is idempotent — calling multiple times for the same memberId results in exactly one record', async () => {
      await repo.upsertByMemberId('member-1', 'U_FIRST');
      await repo.upsertByMemberId('member-1', 'U_SECOND');
      await repo.upsertByMemberId('member-1', 'U_THIRD');

      // Only one record should exist for this member
      const found = await repo.findByMemberId('member-1');
      expect(found).not.toBeNull();
      expect(found!.slackUserId).toBe('U_THIRD');

      // The old slackUserIds should no longer resolve
      const oldFirst = await repo.findBySlackUserId('U_FIRST');
      expect(oldFirst).toBeNull();
      const oldSecond = await repo.findBySlackUserId('U_SECOND');
      expect(oldSecond).toBeNull();
    });

    it('does not affect links for other memberIds', async () => {
      await repo.upsertByMemberId('member-1', 'U111');
      await repo.upsertByMemberId('member-2', 'U222');
      await repo.upsertByMemberId('member-1', 'U333');

      const link1 = await repo.findByMemberId('member-1');
      const link2 = await repo.findByMemberId('member-2');

      expect(link1!.slackUserId).toBe('U333');
      expect(link2!.slackUserId).toBe('U222');
    });
  });

  describe('delete', () => {
    it('removes the link for the given memberId', async () => {
      await repo.create({ memberId: 'member-1', slackUserId: 'U12345' });

      await repo.delete('member-1');

      const found = await repo.findByMemberId('member-1');
      expect(found).toBeNull();
    });

    it('removes the link so it is no longer findable by slackUserId', async () => {
      await repo.create({ memberId: 'member-1', slackUserId: 'U12345' });

      await repo.delete('member-1');

      const found = await repo.findBySlackUserId('U12345');
      expect(found).toBeNull();
    });

    it('does not throw when deleting a non-existent memberId', async () => {
      await expect(repo.delete('non-existent')).resolves.toBeUndefined();
    });

    it('does not affect other links', async () => {
      await repo.create({ memberId: 'member-1', slackUserId: 'U111' });
      await repo.create({ memberId: 'member-2', slackUserId: 'U222' });

      await repo.delete('member-1');

      const link2 = await repo.findByMemberId('member-2');
      expect(link2).not.toBeNull();
      expect(link2!.slackUserId).toBe('U222');
    });
  });
});
