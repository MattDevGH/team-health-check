/**
 * Deciding whether a `response_url` is somewhere this application will post.
 *
 * Requirements: Slack Sign In NFR 1.5; NFR 4.8
 *
 * The URL arrives inside the interaction payload. A verified signature means
 * Slack sent it, which is most of the protection — but it is the one field in
 * the payload that makes this server open a connection to an address it was
 * handed, and "Slack sent it" is an argument about today's Slack rather than a
 * property of the value.
 *
 * So it is checked against what Slack actually uses. The cost of being wrong
 * here is a server that can be pointed at an internal address by anything that
 * can produce a valid signature, and the cost of the check is a list of one
 * hostname.
 *
 * Deliberately not a blocklist of private ranges. A blocklist has to anticipate
 * every address worth refusing — link-local, loopback under another name, a
 * DNS record that resolves inward — and each omission is a hole. An allowlist
 * of the host Slack posts to has no omissions to find.
 */

/** The only host Slack sends a `response_url` for. */
const ALLOWED_HOSTS = new Set(['hooks.slack.com']);

/**
 * True when this is a URL the application will POST a reply to.
 *
 * Never throws: an unparseable value is simply not allowed.
 */
export function isAllowedResponseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  // HTTPS only. A reply carries a member's scores back to them, and the
  // downgrade is the part an attacker would choose.
  if (url.protocol !== 'https:') return false;

  // Credentials in a URL are never something Slack sends, and are a way to
  // make a hostname check read one way and resolve another.
  if (url.username !== '' || url.password !== '') return false;

  return ALLOWED_HOSTS.has(url.hostname);
}
