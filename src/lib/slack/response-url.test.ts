/**
 * Requirements: Slack Sign In NFR 1.5
 *
 * `response_url` is the one field in a Slack payload that makes this server
 * open a connection to an address it was handed. A verified signature means
 * Slack sent it — an argument about today's Slack, not a property of the
 * value.
 */

import { describe, it, expect } from 'vitest';

import { isAllowedResponseUrl } from './response-url';

describe('what the application will post a reply to', () => {
  it('accepts the URL Slack actually sends', () => {
    expect(isAllowedResponseUrl('https://hooks.slack.com/actions/T1/B2/abcdef')).toBe(true);
  });

  it('accepts one with a query string, as Slack sometimes sends', () => {
    expect(isAllowedResponseUrl('https://hooks.slack.com/actions/T1/B2/x?y=1')).toBe(true);
  });
});

describe('what it refuses', () => {
  it.each([
    ['http, because a reply carries the member’s scores', 'http://hooks.slack.com/actions/T1/B2/x'],
    ['a different host entirely', 'https://evil.example.com/actions/T1/B2/x'],
    ['a host that merely ends with the right name', 'https://hooks.slack.com.evil.example/x'],
    ['a host that merely contains it', 'https://evilhooks.slack.com.attacker.test/x'],
    ['loopback', 'https://127.0.0.1/actions'],
    ['loopback by name', 'https://localhost/actions'],
    ['the cloud metadata address', 'https://169.254.169.254/latest/meta-data/'],
    ['a private range', 'https://10.0.0.5/internal'],
    ['a file URL', 'file:///etc/passwd'],
    ['something that is not a URL', 'not a url'],
    ['an empty string', ''],
  ])('refuses %s', (_why, url) => {
    expect(isAllowedResponseUrl(url)).toBe(false);
  });

  /**
   * `https://hooks.slack.com@evil.example/` has a hostname of `evil.example`
   * and reads, to a person skimming, as the allowed host.
   */
  it('refuses credentials in the URL, which make a host read one way and resolve another', () => {
    expect(isAllowedResponseUrl('https://hooks.slack.com@evil.example/x')).toBe(false);
    expect(isAllowedResponseUrl('https://user:pass@hooks.slack.com/x')).toBe(false);
  });

  it('refuses a subdomain, because Slack does not use one here', () => {
    expect(isAllowedResponseUrl('https://a.hooks.slack.com/actions')).toBe(false);
  });
});
