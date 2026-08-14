import { describe, expect, it } from 'vitest';
import { buildInfo } from '@platform/buildInfo';

/**
 * Guards the build-identity wiring.
 *
 * /health.json and the bundle must agree on the commit SHA — that agreement is
 * what makes a deployment verifiable (tests/e2e/health.spec.ts). If the Vite
 * `define` substitution silently stopped working, these constants would become
 * the literal strings "__BUILD_SHA__" and the E2E assertion would still pass,
 * because both sides would be wrong in the same way.
 */
describe('buildInfo', () => {
  it('resolves the injected build constants rather than leaving placeholders', () => {
    expect(buildInfo.version).not.toContain('__');
    expect(buildInfo.buildSha).not.toContain('__');
    expect(buildInfo.builtAt).not.toContain('__');
  });

  it('derives the short SHA from the full SHA', () => {
    expect(buildInfo.buildShaShort).toBe(buildInfo.buildSha.slice(0, 7));
    expect(buildInfo.buildShaShort.length).toBeLessThanOrEqual(7);
  });

  it('exposes an ISO timestamp', () => {
    expect(Number.isNaN(Date.parse(buildInfo.builtAt))).toBe(false);
  });

  it('reports a boolean dev flag', () => {
    expect(typeof buildInfo.isDev).toBe('boolean');
  });
});
