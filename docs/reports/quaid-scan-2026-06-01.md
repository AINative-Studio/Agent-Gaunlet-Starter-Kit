# quaid-scanner Report: /Users/karstenwade/Projects/AINative-Studio/src/Agent-Gaunlet-Starter-Kit

**Score:** 🔴 1.4/10 — CRITICAL risk
**Maturity:** sandbox | **Depth:** standard | **Duration:** 0.2s
**Scanned:** 2026-06-01T21:53:47.388Z

## Pillar Scores

| Pillar | Score | Weight | Findings |
|--------|-------|--------|----------|
| Security | 0.0 | 25% | 2C 9W 1I |
| Governance | 0.0 | 20% | 1C 4W 11I |
| Community | 3.0 | 15% | 0C 2W 8I |
| AI Readiness | 4.0 | 15% | 0C 4W 0I |
| Inclusive Language | 0.0 | 15% | 0C 5W 29I |
| Technical Rigor | 4.0 | 10% | 0C 3W 3I |

## Critical Findings

### dep-pinning-packages-7
**Pillar:** Security | **Category:** dependency-pinning

Unpinned Python dependency "mcp" has no version constraint

_(source: local file check)_

> File: `requirements.txt`:1

**Suggestion:** Pin "mcp" with == (e.g., "mcp==x.y.z")

**Reference:** https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies

### dep-pinning-packages-8
**Pillar:** Security | **Category:** dependency-pinning

Unpinned Python dependency "python-dotenv" has no version constraint

_(source: local file check)_

> File: `requirements.txt`:2

**Suggestion:** Pin "python-dotenv" with == (e.g., "python-dotenv==x.y.z")

**Reference:** https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies

### license-detection-scanner:missing
**Pillar:** Governance | **Category:** license

No license detected. Without a license, the project is under exclusive copyright by default.

_(source: local file check)_

**Suggestion:** Add a LICENSE file to the repository root. Visit https://choosealicense.com/ for guidance.

**Reference:** https://choosealicense.com/

## Warnings

- **[TIMEOUT-binary-artifacts]** Scanner "binary-artifacts" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[TIMEOUT-dep-pinning-docker]** Scanner "dep-pinning-docker" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[dep-pinning-packages-1]** Loosely pinned dependency "@modelcontextprotocol/sdk": "^1.12.1" uses ^ prefix in dependencies *(Consider pinning "@modelcontextprotocol/sdk" to an exact version for reproducible builds)*
- **[dep-pinning-packages-2]** Loosely pinned dependency "zod": "^3.24.4" uses ^ prefix in dependencies *(Consider pinning "zod" to an exact version for reproducible builds)*
- **[dep-pinning-packages-3]** Loosely pinned dependency "@types/node": "^24.5.2" uses ^ prefix in devDependencies *(Consider pinning "@types/node" to an exact version for reproducible builds)*
- **[dep-pinning-packages-4]** Loosely pinned dependency "tsx": "^4.19.3" uses ^ prefix in devDependencies *(Consider pinning "tsx" to an exact version for reproducible builds)*
- **[dep-pinning-packages-5]** Loosely pinned dependency "typescript": "^5.8.3" uses ^ prefix in devDependencies *(Consider pinning "typescript" to an exact version for reproducible builds)*
- **[TIMEOUT-openssf-local-checks]** Scanner "openssf-local-checks" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[TIMEOUT-openssf-scorecard]** Scanner "openssf-scorecard" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[TIMEOUT-clearly-defined]** Scanner "clearly-defined" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[governance-classification-1]** Unclear governance model — best guess is "Community" with low confidence (35%) *(Document the governance model explicitly in GOVERNANCE.md for clarity)*
- **[license-content-validation-1]** No LICENSE file found in repository root *(Add a LICENSE file with a recognized open source license)*
- **[TIMEOUT-license-header-scanner]** Scanner "license-header-scanner" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[psych-safety-1]** No Code of Conduct found *(Add a CODE_OF_CONDUCT.md — see https://www.contributor-covenant.org/)*
- **[support-channels-1]** No SUPPORT.md or .github/SUPPORT.md found *(Add a SUPPORT.md documenting how users can get help)*
- **[TIMEOUT-ai-repo-detection]** Scanner "ai-repo-detection" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[TIMEOUT-dataset-provenance]** Scanner "dataset-provenance" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[TIMEOUT-model-card-detection]** Scanner "model-card-detection" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[TIMEOUT-model-card-scoring]** Scanner "model-card-scoring" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[AK-PREREQ-MISSING-README.md]** README.md contains tool commands but no Prerequisites or Requirements section *(Consider adding a Prerequisites section listing required tools and versions)*
- **[TIMEOUT-diminishing-language-scanner]** Scanner "diminishing-language-scanner" timed out after undefinedms *(Increase scannerTimeout in configuration or check network connectivity)*
- **[TIMEOUT-inclusive-code-scanner]** Scanner "inclusive-code-scanner" failed: Cannot read properties of undefined (reading 'termListUrl') *(Check scanner implementation for errors)*
- **[TIMEOUT-inclusive-doc-scanner]** Scanner "inclusive-doc-scanner" failed: Cannot read properties of undefined (reading 'termListUrl') *(Check scanner implementation for errors)*
- **[TIMEOUT-inclusive-naming-scanner]** Scanner "inclusive-naming-scanner" failed: Cannot read properties of undefined (reading 'termListUrl') *(Check scanner implementation for errors)*
- **[interaction-templates-1]** No issue templates configured *(Add .github/ISSUE_TEMPLATE/ with bug report and feature request templates)*
- **[linter-config-1]** No linter configuration found *(Add a linter (ESLint, Prettier, Ruff, golangci-lint, etc.) and configure it to run in CI)*
- **[test-coverage-2]** No coverage configuration file found *(Add a coverage configuration (e.g., vitest.config.ts with coverage thresholds, jest.config.js with coverageThreshold, or .nycrc) to enforce coverage minimums)*

## Info

- **[branch-protection-1]** GitHub token not provided. Cannot check branch protection settings.
- **[asset-protection-1]** No trademark policy found (optional)
- **[asset-protection-2]** No export control documentation found (optional)
- **[asset-protection-3]** No CLA or DCO requirement detected
- **[asset-protection-4]** Contributor friction level: Low
- **[bus-factor-1]** Bus factor: 1, Elephant factor: 60% (3 contributors, 10 commits in last 12 months)
- **[dep-license-scanning-1]** package.json found but node_modules not installed — cannot scan dependency licenses
- **[dep-license-scanning-2]** Python dependencies detected (requirements.txt) — license scanning requires installed packages
- **[governance-detection-1]** No governance documentation found
- **[license-compatibility-1]** Cannot check license compatibility — no LICENSE file found
- **[vendor-neutrality-domain-count]** Found 3 unique email domain(s) across 10 commits
- **[vendor-neutrality-no-succession]** No succession planning documentation found
- **[burnout-detection-1]** Burnout detection requires a GitHub token
- **[contributor-data-2]** Contributor emails span 3 domains
- **[contributor-funnel-1]** Contributor funnel: 0 core, 1 regular, 2 casual (3 total)
- **[funding-1]** No funding infrastructure detected
- **[issue-closure-1]** Issue closure analysis requires a GitHub token
- **[response-classification-1]** Response classification requires a GitHub token
- **[response-time-1]** Response time analysis requires a GitHub token
- **[stale-bot-1]** No stale bot configured
- **[AK-GIT-CLONE-README.md:18]** Assumed knowledge: "clone" operation used without explanation
- **[AK-GIT-BRANCH-README.md:20]** Assumed knowledge: "branch" operation used without explanation
- **[AK-TOOL-NPM-README.md:21]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:28]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:31]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:39]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:45]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:46]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:135]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:136]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:137]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:138]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:139]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:140]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:141]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:142]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:143]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:144]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-TOOL-NPM-README.md:231]** Assumed knowledge: "npm" command used without Node.js listed as prerequisite
- **[AK-ACRONYM-MCP-README.md:3]** Undefined acronym "MCP" may confuse newcomers
- **[AK-ACRONYM-GTC-README.md:5]** Undefined acronym "GTC" may confuse newcomers
- **[AK-ACRONYM-TTS-README.md:12]** Undefined acronym "TTS" may confuse newcomers
- **[AK-ACRONYM-SSE-README.md:108]** Undefined acronym "SSE" may confuse newcomers
- **[AK-ACRONYM-LLM-README.md:109]** Undefined acronym "LLM" may confuse newcomers
- **[AK-GIT-CLONE-docs/getting-started.md:13]** Assumed knowledge: "clone" operation used without explanation
- **[AK-GIT-CLONE-docs/getting-started.md:16]** Assumed knowledge: "clone" operation used without explanation
- **[AK-ACRONYM-NVIDIA-docs/getting-started.md:10]** Undefined acronym "NVIDIA" may confuse newcomers
- **[AK-ACRONYM-MCP-docs/getting-started.md:11]** Undefined acronym "MCP" may confuse newcomers
- **[AK-ACRONYM-LLM-docs/getting-started.md:36]** Undefined acronym "LLM" may confuse newcomers
- **[release-cadence-1]** No releases or version tags found
- **[test-coverage-3]** No coverage badge found in README
- **[semver-validation-1]** No git tags found — cannot validate SemVer

## Recommendations

- **[HIGH impact / medium effort]** Pin "mcp" with == (e.g., "mcp==x.y.z")
  - https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies
- **[HIGH impact / medium effort]** Pin "python-dotenv" with == (e.g., "python-dotenv==x.y.z")
  - https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies
- **[HIGH impact / medium effort]** Add a LICENSE file to the repository root. Visit https://choosealicense.com/ for guidance.
  - https://choosealicense.com/
- **[MEDIUM impact / low effort]** Increase scannerTimeout in configuration or check network connectivity
- **[MEDIUM impact / low effort]** Consider pinning "@modelcontextprotocol/sdk" to an exact version for reproducible builds
- **[MEDIUM impact / low effort]** Increase scannerTimeout in configuration or check network connectivity
- **[MEDIUM impact / low effort]** Document the governance model explicitly in GOVERNANCE.md for clarity
- **[MEDIUM impact / low effort]** Add a LICENSE file with a recognized open source license
- **[MEDIUM impact / low effort]** Add a CODE_OF_CONDUCT.md — see https://www.contributor-covenant.org/
- **[MEDIUM impact / low effort]** Add a SUPPORT.md documenting how users can get help
- **[MEDIUM impact / low effort]** Increase scannerTimeout in configuration or check network connectivity
- **[MEDIUM impact / low effort]** Consider adding a Prerequisites section listing required tools and versions
- **[MEDIUM impact / low effort]** Increase scannerTimeout in configuration or check network connectivity
- **[MEDIUM impact / low effort]** Check scanner implementation for errors
- **[MEDIUM impact / low effort]** Add .github/ISSUE_TEMPLATE/ with bug report and feature request templates
- **[MEDIUM impact / low effort]** Add a linter (ESLint, Prettier, Ruff, golangci-lint, etc.) and configure it to run in CI
- **[MEDIUM impact / low effort]** Add a coverage configuration (e.g., vitest.config.ts with coverage thresholds, jest.config.js with coverageThreshold, or .nycrc) to enforce coverage minimums

## Score Rationale

Overall score is a weighted sum of six pillar scores (each scored 0–10).

| Pillar | Weight | Raw Score | Contribution |
|--------|--------|-----------|-------------|
| Security | 25% | 0.0 | 0.00 |
| Governance | 20% | 0.0 | 0.00 |
| Community | 15% | 3.0 | 0.45 |
| AI Readiness | 15% | 4.0 | 0.60 |
| Inclusive Language | 15% | 0.0 | 0.00 |
| Technical Rigor | 10% | 4.0 | 0.40 |
| **Overall** | **100%** | | **1.40** |

---
*quaid-scanner v0.1.2 | 2026-06-01T21:53:47.388Z*
*Commit: 52b7316b20b06e36f2cf249a2bf8cd92f933349c*