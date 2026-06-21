import { describe, it, expect } from 'vitest';

/**
 * Tests for GET/POST /api/teams/[teamId]/members
 * Requirements: 1.3, 1.4, 1.5, 1.7, 19.2
 */

// We test by importing the route handlers and calling them directly.
// The route.ts uses module-level container state.
import { GET, POST } from './route';

describe('GET /api/teams/[teamId]/members', () => {
  it('returns list of members for a team', async () => {
    const request = new Request('http://localhost/api/teams/team1/members', {
      method: 'GET',
    });

    const response = await GET(request, {
      params: Promise.resolve({ teamId: 'team1' }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('POST /api/teams/[teamId]/members', () => {
  it('adds a member with valid name and returns 201', async () => {
    const request = new Request('http://localhost/api/teams/team1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice Smith' }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ teamId: 'team1' }),
    });
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.name).toBe('Alice Smith');
    expect(body.id).toBeDefined();
    expect(body.teamId).toBe('team1');
  });

  it('adds a member with name and email', async () => {
    const request = new Request('http://localhost/api/teams/team1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob Jones', email: 'bob@example.com' }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ teamId: 'team1' }),
    });
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.name).toBe('Bob Jones');
    expect(body.email).toBe('bob@example.com');
  });

  it('rejects empty name with 400 validation error', async () => {
    const request = new Request('http://localhost/api/teams/team1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ teamId: 'team1' }),
    });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid email with 400 validation error', async () => {
    const request = new Request('http://localhost/api/teams/team1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Charlie', email: 'not-an-email' }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ teamId: 'team1' }),
    });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects name exceeding 100 characters with 400', async () => {
    const request = new Request('http://localhost/api/teams/team1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a'.repeat(101) }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ teamId: 'team1' }),
    });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
