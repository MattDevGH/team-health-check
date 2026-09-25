/**
 * Refuses confidential data in the documents everybody is told to read.
 *
 * Requirements: NFR 4.8
 *
 * `AI_CONTEXT.md` carried a production team id, two production session ids, the
 * scores and trend indicators recorded in both, and a member handle — committed
 * to a public repository on 2026-08-23 and still there a month later. This
 * project's own rule is that a response score, a trend indicator, free text, a
 * session token and an email address never reach a log, because they are the
 * confidential payload of the entire product. Nothing said the same about a
 * tracked file, so nothing stopped it.
 *
 * **Deliberately narrow.** Specs, tests and prose talk about scores, ranges and
 * the three trend values constantly, and a general "score-shaped text" check
 * would fire on all of it — then be switched off, or push people into awkward
 * wording to appease it. These three patterns match how *recorded* data
 * actually appeared and leave discussion alone.
 *
 * Fenced code blocks are skipped: a fixture is where a fake identifier belongs.
 *
 * This is a stopgap. The intended end state is a generated status document with
 * defined fields, where the question is what is *allowed* in rather than what is
 * forbidden — at which point this can go.
 */

import { readFileSync } from 'node:fs';

/** Documents every session is instructed to read, so the ones that matter most. */
const GUARDED = ['AI_CONTEXT.md', 'README.md', 'AGENTS.md'];

export interface Finding {
  kind: string;
  line: number;
  text: string;
}

const PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  /**
   * A cuid, which is what every id in this database looks like: `c` then 24
   * lowercase alphanumerics. A git SHA is hexadecimal and usually shorter; a
   * run id is digits. Neither matches.
   */
  { kind: 'record identifier', pattern: /\bc[a-z0-9]{24}\b/g },

  /**
   * Four or more scores joined by slashes — `4/5/3/3/4`. One session's answers
   * for one member. A date, a version and a two-value ratio all stay below the
   * threshold.
   */
  { kind: 'recorded scores', pattern: /\b[1-5](?:\/[1-5]){3,}\b/g },

  /**
   * Four or more trend values joined by slashes. Three is the enumeration —
   * "improving/stable/declining" — and appears all over the specs; a recording
   * of one session has one value per question, which is five.
   */
  {
    kind: 'recorded trend indicators',
    pattern: /\b(?:improving|stable|declining|none)(?:\/(?:improving|stable|declining|none)){3,}\b/g,
  },
];

/**
 * Every finding in a document's text, outside fenced code blocks.
 *
 * Exported so the rule can be exercised directly. The CLI below is the only
 * other caller, so what runs in CI is what the tests cover.
 */
export function findSensitiveContent(text: string): Finding[] {
  const findings: Finding[] = [];
  let inFence = false;

  text.split('\n').forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    for (const { kind, pattern } of PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        findings.push({ kind, line: index + 1, text: match[0] });
      }
    }
  });

  return findings;
}

/** Returns the process exit code, so a test can run the gate without spawning. */
export function runSensitiveContentCheck(
  files: string[] = GUARDED,
  output: { out(m: string): void; err(m: string): void } = { out: console.log, err: console.error },
): number {
  let total = 0;

  for (const file of files) {
    const findings = findSensitiveContent(readFileSync(file, 'utf8'));
    total += findings.length;

    for (const finding of findings) {
      output.err(`${file}:${finding.line}  ${finding.kind}: ${finding.text}`);
    }
  }

  if (total > 0) {
    output.err(
      `\n${total} piece(s) of confidential data found in tracked documents.\n` +
        'A response score, a trend indicator, or a record identifier from a real\n' +
        'team does not belong in a file everybody is told to read. Describe what it\n' +
        'was evidence of instead.',
    );
    return 1;
  }

  output.out(`Checked ${files.length} document(s): no confidential data.`);
  return 0;
}

if (process.argv[1]?.endsWith('check-sensitive-doc-content.ts')) {
  process.exit(runSensitiveContentCheck());
}
