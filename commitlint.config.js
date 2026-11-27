// Conventional Commits, see docs/07-git-workflow.md.
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"],
    ],
    "scope-enum": [2, "always", ["frontend", "backend", "tests", "docs", "infra", "contract"]],
    "scope-empty": [2, "never"],
    "header-max-length": [2, "always", 72],
    "subject-case": [0],
  },
};
