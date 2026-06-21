import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';
import { POST, GET } from './route';

// Requirements: 1.1, 1.2, 20.1

describe('POST /api/teams', () => {
  beforeEach(() => {
    // Reset module-level container between tests by re-importing
    // Since route.ts uses module-level state, we test the handler directly
  });

  it('creates a team with valid name and returns 201', async () => {
    const request = new Request('http://localhost/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Team' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.name).toBe('My Team');
    expect(body.id).toBeDefined();
  });

  it('creates a team with name and description', async () => {
    const request = new Request('http://localhost/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dev Team', description: 'A great team' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.name).toBe('Dev Team');
    expect(body.description).toBe('A great team');
  });

  it('rejects empty team name with 400 validation error', async () => {
    const request = new Request('http://localhost/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.errors).toBeDefined();
    expect(body.error.errors.length).toBeGreaterThan(0);
  });

  it('rejects whitespace-only team name with 400 validation error', async () => {
    const request = new Request('http://localhost/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects name exceeding 100 characters with 400', async () => {
    const request = new Request('http://localhost/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a'.repeat(101) }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects description exceeding 500 characters with 400', async () => {
    const request = new Request('http://localhost/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid Team', description: 'x'.repeat(501) }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing body with 500 (invalid JSON)', async () => {
    const request = new Request('http://localhost/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const response = await POST(request);
    // Malformed JSON should result in 500 (caught by withErrorHandling)
    expect(response.status).toBe(500);
  });
});

describe('GET /api/teams', () => {
  it('returns an array of teams', async () => {
    const request = new Request('http://localhost/api/teams', { method: 'GET' });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns teams that were previously created', async () => {
    // Create a team first
    const createRequest = new Request('http://localhost/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Listed Team' }),
    });
    await POST(createRequest);

    // List teams
    const listRequest = new Request('http://localhost/api/teams', { method: 'GET' });
    const response = await GET(listRequest);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body.some((t: { name: string }) => t.name === 'Listed Team')).toBe(true);
  });
});
