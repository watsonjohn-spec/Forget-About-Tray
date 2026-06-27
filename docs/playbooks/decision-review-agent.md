# Decision Review Agent

Purpose:

Keep `docs/decisions/README.md` and related project docs aligned with the code we change, so GitHub records both what was done and why it was done.

When to use:

- Before merging a feature branch or pull request that changes shared platform behaviour.
- Daily when project conversations, commits, pull requests, or uncommitted repo changes exist since the previous decision review.
- Before production deployment when auth, payment, Supabase, events, factory handoff, routing, generator behaviour, or operational workflow changed.

Prerequisites:

- A clean understanding of the review window: pull request base/head, last release, or last decision-doc update.
- Local access to the repo.
- GitHub context when the review is tied to a pull request.
- For a scheduled ChatGPT run, ChatGPT history/project access and the GitHub app must be enabled in the ChatGPT workspace if they are available on the current plan.

Approval model:

- Scheduled ChatGPT runs draft proposed documentation changes only.
- The agent must ask for approval before pushing, committing, opening a pull request, adding a GitHub comment, or uploading files.
- Preferred approval path: the agent sends the proposed decision entries, related doc edits, and GitHub handoff plan to the user. After approval, a Codex or GitHub write-capable workflow applies the patch and opens a pull request.
- If ChatGPT can read GitHub but cannot write to it in the current experience, paste the approved patch into Codex in this repo and ask Codex to apply it, run `npm.cmd run check`, commit, push, and open a pull request.

ChatGPT scheduled setup:

1. In ChatGPT, connect GitHub to the repository `watsonjohn-spec/Forget-About-Tray` if available in Settings -> Apps.
2. Open or create a dedicated Forget About project conversation.
3. Start ChatGPT agent mode and ask it to run the prompt below.
4. After the first run completes, use the schedule/clock control to repeat daily.
5. Keep app permissions at a setting that requires approval before changes are made outside ChatGPT.

Suggested ChatGPT scheduled prompt:

```text
Every day, act as the Forget About decision review agent.

Review my available ChatGPT conversations for this project, plus the GitHub repository watsonjohn-spec/Forget-About-Tray, for decisions made since the last review that should be reflected in docs/decisions/README.md or related docs.

If there are no project conversations, commits, pull requests, or uncommitted repo changes since the previous review, report "No decision-documentation update needed" and stop.

Use the rules in .agents/decision-review-agent.md if you can read the repository. If you cannot read that file, follow this summary:
- capture what changed, why it changed, consequences, and follow-ups;
- verify code or documentation changes against GitHub evidence before drafting docs;
- do not invent rationale when the conversation or repo evidence is unclear;
- do not include secrets, private customer data, payment details, or full environment values;
- draft changes only and ask me to approve before writing to GitHub.

Output:
1. review window;
2. conversations or GitHub sources used;
3. proposed decision entries;
4. related docs that should change;
5. exact markdown patch or replacement text;
6. open questions;
7. a clear approval request before any GitHub write action.
```

Steps:

1. Read `.agents/decision-review-agent.md`.
2. Check the current branch and working tree:

   ```powershell
   git --git-dir=.deploy-git --work-tree=. status --short --branch
   git --git-dir=.deploy-git --work-tree=. diff --name-status
   ```

3. Find the last decision-doc update when no pull request base is available:

   ```powershell
   $lastDecision = git --git-dir=.deploy-git --work-tree=. log -1 --format=%H -- docs/decisions/README.md
   git --git-dir=.deploy-git --work-tree=. log --oneline "$lastDecision..HEAD"
   git --git-dir=.deploy-git --work-tree=. diff --name-status "$lastDecision..HEAD"
   ```

4. Inspect changed files that affect architecture, routes, generators, shared services, Supabase, Stripe, events, deployment, or operations.
5. Add or update entries in `docs/decisions/README.md` using the existing date, decision, reason, consequences, and follow-ups format.
6. Update related docs when the changed code alters their contract:

   - `docs/architecture/system-overview.md`
   - `docs/features/README.md`
   - `docs/playbooks/README.md`
   - `docs/EVENT_LOG.md`

7. If the rationale is not clear from code, commit messages, pull request text, or existing docs, ask for the missing reason instead of inventing it.
8. Run:

   ```powershell
   npm.cmd run check
   ```

9. Review the docs diff before publishing:

   ```powershell
   git --git-dir=.deploy-git --work-tree=. diff -- docs .agents AGENTS.md
   ```

Verification:

- `npm.cmd run check` passes.
- Every added decision names what changed, why it changed, consequences, and follow-ups.
- No secrets, private data, or unverified claims were added to docs.
- GitHub pull request or commit summary lists the decision docs touched.

Rollback or recovery:

- If a decision entry is wrong, amend the docs in a new commit rather than deleting history silently.
- If the code change is still being explored and no durable decision exists yet, leave an explicit follow-up rather than forcing a premature decision.

Related docs:

- `.agents/decision-review-agent.md`
- `docs/decisions/README.md`
- `AGENTS.md`
