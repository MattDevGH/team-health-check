/**
 * A Delivery Manager records which Slack account belongs to which member.
 *
 * Requirements: Slack Sign In 2.1, 2.2, 2.3, 2.4, NFR 2.1
 * Properties: 3 (binding is injective)
 *
 * Phase 1 lets a linked member sign in from Slack. Nobody can become linked
 * without email, because the pairing flow derives the member from a session
 * cookie — so signing in needs email, and linking needs signing in. This is the
 * way out that costs no new Slack scope.
 *
 * The manager asserts *who a Slack account belongs to*. They never hold a
 * credential and cannot sign in as that person: authentication stays the
 * member's own Slack login. That distinction is the whole reason this design
 * was chosen over surfacing session links, so it is asserted rather than
 * assumed.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createTeamService, type TeamService } from '@/lib/services/team.service';
import { ConflictError, NotFoundError } from '@/lib/errors';

let repos: Repositories;
let team: TeamService;
let teamId = '';
let managerId = '';

beforeEach(async () => {
  repos = createInMemoryRepositories();
  team = createTeamService({
    teamRepo: repos.team,
    teamMemberRepo: repos.teamMember,
    teamMemberRoleRepo: repos.teamMemberRole,
    slackIdentityLinkRepo: repos.slackIdentityLink,
    auditLogRepo: repos.auditLog,
    sessionRepo: repos.session,
  });

  const created = await repos.team.create({ name: 'Binding Team' });
  teamId = created.id;
  const manager = await repos.teamMember.create({
    teamId,
    name: 'Manager',
    email: 'manager@binding.test',
  });
  managerId = manager.id;
});

async function member(name: string) {
  return repos.teamMember.create({
    teamId,
    name,
    email: `${name.toLowerCase()}@binding.test`,
  });
}

describe('recording a binding', () => {
  it('links the Slack account to the member', async () => {
    const alice = await member('Alice');

    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);

    expect(await repos.slackIdentityLink.findBySlackUserId('U_ALICE')).toMatchObject({
      memberId: alice.id,
    });
  });

  it('replaces a previous Slack account rather than adding a second', async () => {
    // A member has one Slack account. Two links for one member would make
    // "who is this?" ambiguous in the other direction
    const alice = await member('Alice');
    await team.setSlackBinding(teamId, alice.id, 'U_OLD', managerId);

    await team.setSlackBinding(teamId, alice.id, 'U_NEW', managerId);

    expect(await repos.slackIdentityLink.findByMemberId(alice.id)).toMatchObject({
      slackUserId: 'U_NEW',
    });
    expect(await repos.slackIdentityLink.findBySlackUserId('U_OLD')).toBeNull();
  });

  it('refuses a Slack account already bound to somebody else', async () => {
    /*
     * Property 3. One Slack account cannot be two people — and the failure
     * this prevents is the serious one: a manager mistyping an id and handing
     * one member the ability to sign in as another.
     */
    const alice = await member('Alice');
    const bob = await member('Bob');
    await team.setSlackBinding(teamId, alice.id, 'U_SHARED', managerId);

    await expect(team.setSlackBinding(teamId, bob.id, 'U_SHARED', managerId)).rejects.toThrow(
      ConflictError,
    );
  });

  it('leaves the existing binding intact when it refuses', async () => {
    // The throw is the symptom. The guarantee is that Alice still owns it
    const alice = await member('Alice');
    const bob = await member('Bob');
    await team.setSlackBinding(teamId, alice.id, 'U_SHARED', managerId);

    await team.setSlackBinding(teamId, bob.id, 'U_SHARED', managerId).catch(() => undefined);

    expect(await repos.slackIdentityLink.findBySlackUserId('U_SHARED')).toMatchObject({
      memberId: alice.id,
    });
  });

  it('allows rebinding the same account to the same member', async () => {
    // Idempotent: a manager who saves the form twice has not made a mistake
    const alice = await member('Alice');
    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);

    await expect(
      team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId),
    ).resolves.toBeDefined();
  });

  it('refuses a member who is not in this team', async () => {
    // The teamId in the URL is not a permission on its own; the member has to
    // actually belong to it
    const other = await repos.team.create({ name: 'Other Team' });
    const stranger = await repos.teamMember.create({
      teamId: other.id,
      name: 'Stranger',
      email: 'stranger@binding.test',
    });

    await expect(
      team.setSlackBinding(teamId, stranger.id, 'U_STRANGER', managerId),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('clearing a binding', () => {
  it('removes the link', async () => {
    const alice = await member('Alice');
    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);

    await team.setSlackBinding(teamId, alice.id, null, managerId);

    expect(await repos.slackIdentityLink.findByMemberId(alice.id)).toBeNull();
  });

  it('stops that Slack account signing anybody in', async () => {
    // The revocation has to be real, not a hidden row that still resolves
    const alice = await member('Alice');
    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);

    await team.setSlackBinding(teamId, alice.id, null, managerId);

    expect(await repos.slackIdentityLink.findBySlackUserId('U_ALICE')).toBeNull();
  });

  it('is harmless when there was no binding', async () => {
    const alice = await member('Alice');

    await expect(team.setSlackBinding(teamId, alice.id, null, managerId)).resolves.toBeDefined();
  });
});

describe('what the audit log says about it', () => {
  /*
   * Requirements: Slack Sign In 2.3, NFR 2.1
   *
   * Asserting who somebody is, on their behalf, is exactly the kind of act a
   * log exists for. The entry names the actor and says *how* the binding came
   * about, so a manager-asserted link is distinguishable from one an email
   * match created — which phase 3 will add.
   */

  async function entries() {
    return repos.auditLog.findByTeamId(teamId);
  }

  /*
   * By change type, not by position.
   *
   * `findByTeamId` sorts newest first on a timestamp, and two entries written
   * in the same millisecond sort unpredictably — so `entries()[0]` picked the
   * wrong one about half the time. A test that depends on the order of two
   * events that share a timestamp is a flake waiting for a slow afternoon.
   */
  async function entryOfType(changeType: string) {
    return (await entries()).find(entry => entry.changeType === changeType);
  }

  it('records who asserted a new binding', async () => {
    const alice = await member('Alice');

    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);

    expect(await entryOfType('slack_binding_asserted')).toMatchObject({ userId: managerId });
  });

  it('records a change as well as a creation', async () => {
    const alice = await member('Alice');
    await team.setSlackBinding(teamId, alice.id, 'U_OLD', managerId);

    await team.setSlackBinding(teamId, alice.id, 'U_NEW', managerId);

    expect(await entries()).toHaveLength(2);
  });

  it('records a removal', async () => {
    const alice = await member('Alice');
    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);

    await team.setSlackBinding(teamId, alice.id, null, managerId);

    expect(await entryOfType('slack_binding_removed')).toMatchObject({ userId: managerId });
  });

  it('says which member and which Slack account, so the entry can be acted on', async () => {
    const alice = await member('Alice');

    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);

    const entry = await entryOfType('slack_binding_asserted');
    expect(entry?.newValue).toContain('U_ALICE');
    expect(entry?.newValue).toContain(alice.id);
  });

  it('writes nothing when nothing changed', async () => {
    // A log of non-events is a log nobody reads
    const alice = await member('Alice');
    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);
    const before = (await entries()).length;

    await team.setSlackBinding(teamId, alice.id, 'U_ALICE', managerId);

    expect((await entries()).length).toBe(before);
  });

  it('writes nothing when a binding is refused', async () => {
    // The refusal is not a change, and recording it would suggest one happened
    const alice = await member('Alice');
    const bob = await member('Bob');
    await team.setSlackBinding(teamId, alice.id, 'U_SHARED', managerId);
    const before = (await entries()).length;

    await team.setSlackBinding(teamId, bob.id, 'U_SHARED', managerId).catch(() => undefined);

    expect((await entries()).length).toBe(before);
  });
});
