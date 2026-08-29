# AGENTS.md

# Project Working Instructions

## Mission

This is a small automation project.

Default behavior: Be a surgical editor, not a software architect.

The goal is to complete the requested task with the smallest possible change.

Do **not** optimize, redesign, improve, or extend the project unless explicitly instructed.

---

# Scope

For every request:

* Work **only** on the specific requirement in the prompt.
* Do not expand the scope.
* Do not anticipate future requirements.
* Do not solve unrelated problems.
* Ignore potential improvements unless they are required to complete the requested task.

## Chat Scope Lock

At the beginning of every new chat, classify the first user request into exactly one scope:

* `PLATFORM/ADMIN` — platform, the Admin panel, shared infrastructure, migration, or repository-wide work. Shared dashboard code that implements an automation’s UI is not automatically platform/admin scope.
* `AUTOMATION:<integration_id>` — work for one specific integration only.

The assistant must state the selected scope before taking project actions. The scope is immutable for the chat.

An `AUTOMATION:<integration_id>` chat must refuse requests to modify or discuss another integration, platform code, Admin code, shared infrastructure, deployment configuration, or repository-wide behavior. A `PLATFORM/ADMIN` chat must refuse automation-specific implementation work. Work for a different scope requires a new chat.

Automation-specific forms, modules, API wiring, dashboard pages, and components under `frontend/dashboard` belong to the matching automation scope. `frontend/dashboard/src/pages/AdminPage.jsx` and genuinely shared platform/dashboard infrastructure remain `PLATFORM/ADMIN`.

Before editing, committing, or pushing, run the applicable project scope validator:

```powershell
npm run validate:workspace-scope -- --scope PLATFORM/ADMIN --branch main
```

For integration work, also provide the exact permanent integration ID:

```powershell
npm run validate:workspace-scope -- --scope AUTOMATION --automation-id <integration_id> --branch automation/<integration_id>/work
```

Never combine Admin/platform and automation work, or two automation scopes, in one chat, commit, or push. If the request changes scope, stop and instruct the user to open a new chat.

---

# Code Search Strategy

Minimize token usage.

* Read only the files required for the task.
* Avoid scanning the entire repository.
* Search directly for filenames, functions, endpoints, classes, or text mentioned in the prompt.
* Stop searching once the relevant code has been found.
* Do not perform broad architectural analysis.

---

# Code Changes

Make the smallest possible change.

Prefer:

* Local modifications
* Existing code patterns
* Existing helper functions
* Existing architecture

Avoid:

* Refactoring
* Cleanup
* Renaming
* File moves
* Code style changes
* Formatting unrelated code
* Dependency updates
* Library replacements
* Architectural improvements

Unless explicitly requested.

---

# Testing

Only verify the requested behavior.

Do not:

* Add extensive tests.
* Run the entire test suite.
* Test unrelated functionality.

Only perform the minimum validation necessary to ensure the requested change works.

---

# Communication

Keep responses short.

Do not produce long explanations.

Final response should contain only:

* What changed
* Which files were modified
* How it was verified
* Any blocking issue (if one exists)

Nothing else.

---

# Decision Rule

Before making any change ask:

"Is this change strictly required to complete the user's request?"

If the answer is not an obvious **YES**, do not make the change.

---

# Assumptions

If the request is slightly ambiguous:

* Choose the smallest reasonable implementation.
* Do not add extra functionality.
* Do not over-engineer.
* Ask a question only if the task cannot be completed safely.

---

# Performance

Prioritize:

* Low token usage
* Fast execution
* Minimal reasoning
* Minimal file reads
* Minimal code changes

This project does not require deep architectural analysis.

Favor execution over exploration.

---

# Explicitly Forbidden

Unless explicitly requested, never:

* Refactor code
* Improve architecture
* Optimize performance
* Improve security
* Upgrade packages
* Reorganize folders
* Rename identifiers
* Add logging
* Add configuration
* Introduce abstractions
* Create reusable frameworks
* Fix unrelated bugs
* Address TODO comments
* Modernize code
* Rewrite working code

---

# Guiding Principle

Implement exactly what was requested.

No more.

No less.
