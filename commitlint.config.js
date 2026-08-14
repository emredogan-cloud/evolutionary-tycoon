/**
 * Conventional Commits — enforced, see docs/WORKING_DISCIPLINE.md §3.
 *
 * The scope list mirrors the architecture layers. Keeping it closed means a
 * commit touching a layer that does not exist yet is caught at commit time,
 * which is a cheap early signal of scope creep.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'chore', 'build', 'ci', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'sim',
        'render',
        'ui',
        'app',
        'config',
        'persistence',
        'platform',
        'assets',
        'economy',
        'audio',
        'ci',
        'deploy',
        'docs',
        'tooling',
        'deps',
        'repo',
      ],
    ],
    'scope-empty': [2, 'never'],
    // Disallow Sentence-case/Start-Case/PascalCase/UPPER-CASE subjects, but still
    // permit embedded technical terms (WebGL2, CI, ADR) inside an otherwise
    // lowercase subject. A blanket lower-case rule would force 'webgl2', which
    // is less readable, not more consistent.
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'body-max-line-length': [0],
  },
};
