---
name: ovelle-code-structure
description: Apply Ovelle's ownership and dependency contract when implementing, refactoring or reviewing code in this repository.
---

# Ovelle code structure

Read the root `AGENTS.md`, `docs/architecture/code-structure.md`, and
`architecture/ownership.json` before changing code. Read applicable exceptions and
feature architecture documents. The repository contract is authoritative; do not
maintain an alternative set of rules here.

Locate the actual owner, consumers and tests before adding behavior. Determine
whether the requested change is structural, behavioral, or both. Implement within
the existing owner or justify a distinct responsibility. Preserve transaction and
native capability boundaries; do not move checks out of their enforcement point.

Apply the function, file and abstraction review criteria in the contract. Run the
architecture check and meaningful behavior verification. Inspect failures rather
than widening boundaries or updating baselines to accommodate them. For component
changes, follow the repository's existing Figma workflow.

Before claiming completion, check every completion requirement in the contract
against current files and output. Report exceptions and verification limitations.
For the repository-wide migration, use `docs/architecture/migration-status.md` to
resume outstanding work; do not equate a passing mechanical gate with completion.
