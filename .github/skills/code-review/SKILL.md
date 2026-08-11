# Interplanetary Fund Code Review Skill

## Purpose

Review code for correctness, security, reliability, maintainability, and unintended side effects.

The goal is to identify real problems before code is approved or merged. Do not manufacture findings simply to produce a longer review.

## Review Priorities

Review issues in this order:

1. Security vulnerabilities
2. Data loss or corruption
3. Financial/payment safety
4. Authentication and authorization
5. Incorrect business logic
6. Race conditions and concurrency problems
7. Idempotency and duplicate-operation risks
8. Reliability and error handling
9. Breaking changes
10. Performance problems
11. Maintainability
12. Style and minor improvements

Do not treat minor style issues as more important than functional or security problems.

---

## Understand the Change First

Before reviewing:

- Read the entire changed file when practical.
- Inspect surrounding code.
- Search for callers and consumers of changed functions.
- Search for related schemas, APIs, mutations, queries, and components.
- Determine what behavior the code is intended to provide.
- Check whether the change affects other parts of the application.

Do not make assumptions based only on the changed lines.

---

## Security Review

Always check for:

- Authentication bypasses
- Authorization failures
- IDOR vulnerabilities
- Privilege escalation
- XSS
- Injection vulnerabilities
- SSRF
- CSRF where applicable
- Unsafe redirects
- Reverse-tabnabbing
- Exposed secrets
- Sensitive information leakage
- Unsafe file handling
- Missing input validation
- Trusting client-supplied permissions
- Insecure webhook handling
- Replay attacks
- Race conditions

For external URLs opened with `window.open`, verify that appropriate protections such as:

`noopener,noreferrer`

are used.

Never recommend weakening security controls merely to simplify implementation.

---

## Authentication and Authorization

Verify that sensitive operations:

- Require authentication when appropriate.
- Verify the user's identity server-side.
- Verify authorization server-side.
- Verify ownership of resources where required.
- Do not trust roles or permissions supplied by the client.
- Do not expose administrative operations to unauthorized users.

A UI restriction is not sufficient security.

---

## Payments and Financial Operations

Treat all financial code as high risk.

Check carefully for:

- Duplicate charges
- Duplicate payouts
- Duplicate migrations
- Incorrect amounts
- Unauthorized transfers
- Missing idempotency
- Race conditions
- Retry problems
- Incorrect transaction states
- Client-controlled financial values
- Missing server-side validation

A function described as a queueing operation must not secretly execute the financial operation.

For example, a balance-checking function that queues migrations should create the appropriate queued/pending records but should not independently transfer money.

Financial operations must be explicit, auditable, authorized, and safe to retry.

---

## Data Integrity

Check database changes for:

- Incorrect field names
- Missing fields
- Incorrect types
- Missing validation
- Unsafe defaults
- Backwards compatibility problems
- Data loss
- Broken existing records
- Inconsistent reads and writes

Search the repository for existing references before approving schema changes.

Do not approve deletion or renaming of a field without confirming that existing consumers have been handled.

---

## API and Backend Review

Verify that backend operations:

- Validate inputs.
- Enforce authentication.
- Enforce authorization.
- Validate resource ownership.
- Handle errors correctly.
- Avoid leaking sensitive information.
- Are safe to retry when appropriate.
- Do not depend on client-side security controls.

Check that mutations cannot be abused by changing client-supplied IDs, amounts, roles, or permissions.

---

## Frontend Review

Check that UI changes:

- Preserve existing functionality.
- Correctly handle loading states.
- Correctly handle errors.
- Prevent accidental duplicate submissions.
- Respect authentication and permissions.
- Work on mobile layouts.
- Maintain accessibility.
- Do not present functionality that the backend does not actually implement.

A button or UI control should not imply that an operation is available when the underlying functionality is only a placeholder.

---

## Third-Party Integrations

For OAuth, APIs, payment providers, social platforms, crowdfunding platforms, and webhooks:

- Verify authentication correctly.
- Protect credentials and tokens.
- Validate external responses.
- Verify webhook authenticity when applicable.
- Handle API failures.
- Handle retries safely.
- Prevent duplicate operations.
- Do not claim an integration is implemented when only UI placeholders exist.

---

## AI Features

Verify that AI-generated recommendations cannot accidentally perform consequential actions without the required authorization.

Pay particular attention to:

- Financial actions
- Payments
- Transfers
- Account changes
- Permission changes
- Destructive operations
- External outreach

AI assistance should remain within the permissions and authorization explicitly granted by the product.

---

## Regression Analysis

For every significant change, ask:

- What existing functionality could this break?
- What callers depend on this behavior?
- Could existing users or records be affected?
- Could this change alter permissions?
- Could this disable an existing integration?
- Could retries produce duplicate operations?
- Could this change affect mobile users?
- Could this change affect production data?

If a change removes or disables functionality, identify it explicitly.

---

## Evidence-Based Findings

Only report a problem when there is sufficient evidence from the code or repository.

For every finding, provide:

### Severity

Use:

- **CRITICAL** — Immediate security, financial, data-loss, or production risk.
- **HIGH** — Serious bug or security/reliability problem that should be fixed before approval.
- **MEDIUM** — Meaningful problem that should be addressed but is unlikely to cause immediate severe damage.
- **LOW** — Minor issue or maintainability concern.
- **INFO** — Optional improvement or observation.

### Location

Give the exact file and line number whenever possible.

### Problem

Clearly explain what is wrong.

### Impact

Explain what could happen in real use.

### Recommendation

Give a concise and practical fix.

Do not report vague concerns without explaining the actual failure mode.

---

## Approval Standard

Recommend approval only when:

- No unresolved critical or high-severity issues remain.
- Security controls are adequate.
- Authentication and authorization are correct.
- Financial operations are safe.
- Data integrity is preserved.
- Existing functionality is not unintentionally broken.
- The implementation matches the requested behavior.
- Relevant tests or verification provide reasonable confidence.

Do not approve code merely because it compiles or tests pass.

Passing tests do not prove that security, authorization, payment safety, or business logic are correct.

---

## Do Not Over-Report

Do not:

- Nitpick formatting unnecessarily.
- Demand unrelated refactors.
- Report hypothetical problems without evidence.
- Duplicate the same finding multiple times.
- Treat personal stylistic preferences as bugs.
- Recommend changing working architecture without a concrete reason.

Focus on issues that materially affect the software.

---

## Final Review Format

End every review with:

### Verdict

Choose one:

**APPROVE**  
No blocking issues found.

**APPROVE WITH NOTES**  
No blocking issues found, but minor improvements are recommended.

**REQUEST CHANGES**  
One or more issues should be fixed before approval.

**DO NOT APPROVE**  
A critical security, financial, data-integrity, or production-safety issue exists.

### Summary

Briefly state:

- What was reviewed
- The most important findings
- Whether the change is safe to approve
- Any remaining risks

If approving the change would cause existing functionality to stop working, explicitly say:

**If you approve this change, these features will stop working:**

Then list each affected feature in simple language.
