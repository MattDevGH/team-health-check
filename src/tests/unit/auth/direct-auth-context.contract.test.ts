import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const specDir = path.resolve(root, '.kiro/specs/integration-hardening');
const identityHeaders = ['x-member-id', 'x-user-id', 'x-team-id', 'x-session-id'];
const alternateCredentials = [
  'magic-link tokens',
  'session-link tokens',
  'genesis tokens',
  'verified Slack signatures',
  'scheduler `CRON_SECRET`',
];

function read(pathname: string): string {
  return readFileSync(pathname, 'utf8');
}

function collectProductionSources(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return entry === 'tests' ? [] : collectProductionSources(fullPath);
    }
    const isProductionTypeScript = /\.(?:ts|tsx)$/.test(entry)
      && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry)
      && !entry.endsWith('.d.ts');
    return isProductionTypeScript ? [fullPath] : [];
  });
}

function findIdentityHeaderLiterals(source: string, filename = 'source.ts'): string[] {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && identityHeaders.includes(node.text.toLowerCase())
    ) {
      found.push(node.text.toLowerCase());
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

describe('direct AuthContext contract', () => {
  it('defines the complete authority contract in requirements and design independently', () => {
    const normativeDocuments = [
      read(path.join(specDir, 'requirements.md')),
      read(path.join(specDir, 'design.md')),
    ];

    for (const document of normativeDocuments) {
      expect(document).toMatch(/Auth_?Context\.memberId[\s\S]{0,120}(?:sole|only)[\s\S]{0,60}identity/i);
      for (const header of identityHeaders) expect(document).toContain(header);
      for (const credential of alternateCredentials) {
        expect(document.toLowerCase()).toContain(credential.toLowerCase());
      }
      expect(document).not.toMatch(/SHALL inject|both `x-member-id` and `x-user-id` injected|backward compat(?:ibility)?[^\n]*`x-user-id`/i);
    }
  });

  it('keeps alternate-credential labels synchronized in project context', () => {
    const synchronizedDocuments = [
      read(path.resolve(root, 'README.md')),
      read(path.resolve(root, 'AI_CONTEXT.md')),
    ];

    for (const document of synchronizedDocuments) {
      for (const credential of alternateCredentials) {
        expect(document.toLowerCase()).toContain(credential.toLowerCase());
      }
    }
  });

  it('detects prohibited literals without mistaking comments or URLs for code', () => {
    const source = [
      "const indirect = 'x-user-id'; headers.get(indirect);",
      'headers.set(`x-member-id`, memberId);',
      "const url = 'https://example.test'; headers.append('x-team-id', teamId);",
      "// headers.get('x-session-id');",
      "/* headers.set('x-session-id', sessionId); */",
    ].join('\n');

    expect(findIdentityHeaderLiterals(source)).toEqual([
      'x-user-id',
      'x-member-id',
      'x-team-id',
    ]);
  });

  it('finds no prohibited identity-header literal in production TypeScript', () => {
    const sourceRoot = path.resolve(root, 'src');
    const violations = collectProductionSources(sourceRoot)
      .filter(file => findIdentityHeaderLiterals(read(file), file).length > 0)
      .map(file => path.relative(sourceRoot, file));

    expect(violations).toEqual([]);
  });
});
