# eCW Item Keys Browser

A fast, searchable table of every eCW item key (`mobiledoc.dbo.itemkeys`), joined with
community-maintained descriptions and categories. It works on desktop and mobile, with a
discussion thread per key and maintainer-approved edits.

**Site:** https://takitotech-clinical.github.io/ecwitemkeys/

The design is documented in [PLAN.md](PLAN.md).

## For users

- **Search**: words are combined (`claim batch`), `"quoted phrase"` matches a phrase, `-word`
  excludes, and `key:`, `remarks:`, `display:` or `description:` search one column. Press `/` to
  focus search, `↑`/`↓` to move, `Enter` to open and `Esc` to close.
- **Filters**: only active keys are shown by default. Remove the _Status: Active_ chip to see
  keys that have disappeared from eCW (marked _Expired_ and shown with their last-known values).
  Every view is a shareable link.
- **Propose an edit**: open a key, click **Propose edit**, change the description or category,
  then click **Open proposal on GitHub** and **Submit new issue** on GitHub. You need a GitHub
  account. A bot checks the proposal, and a maintainer approves it.
- **Discuss**: each key's details end with its GitHub Discussions thread.

## For maintainers

### Files

| File                            | Written by                                       |
| ------------------------------- | ------------------------------------------------ |
| `source/itemkeys.rpt`           | You (SSMS export). Never written by automation.  |
| `source/additional.rpt`         | Sync and approved proposals only.                |
| `source/itemkeys.expired.rpt`   | Sync only (last-known values of expired keys).   |
| `source/additional.schema.json` | You, through the column scripts below.           |
| `config/approvers.json`         | You. GitHub logins allowed to approve proposals. |

All rpt files use a backtick (`` ` ``) delimiter, UTF-8 with BOM and CRLF. `.gitattributes`
keeps git from changing their bytes.

### Drop in a new itemkeys export

1. In SSMS, run the query below with _Results to File_ and a backtick delimiter:
   ```sql
   SELECT i.name 'key', i.supportRemarks 'support_remarks', i.displayname 'display_name'
   FROM mobiledoc.dbo.itemkeys i
   ORDER BY i.name
   ```
2. Save it as `source/itemkeys.rpt` and push to `main`. Committing with git and uploading
   through the GitHub web UI both work.
3. The **Pipeline** workflow validates the export (header, field count, and record count
   against the `(N rows affected)` footer). It then runs sync, commits
   `Sync itemkeys (export …): +N added, N expired, N returned`, builds and deploys. New keys get
   `added` set to the sync time. Missing keys get `expired` set. Keys that come back have
   `expired` cleared. The job summary lists every key that changed.
4. A malformed export fails the pipeline, and the live site keeps the previous data.

To preview locally first: `pnpm data:sync --dry-run`.

### Undo a bad export

Revert **both** the export commit and the bot's `Sync itemkeys …` commit that follows it, in one
push. The sync job summary prints the exact command:

```sh
git revert --no-edit <sync-sha> <export-sha>
git push
```

This restores all three rpt files exactly, so the next sync does nothing. If you revert only
the export, sync still repairs wrongly expired keys, but keys the bad export added would then be
marked expired instead of removed.

### Review proposals

Approvers are the logins in `config/approvers.json`: the repository owner
(`takitotech-clinical`) and `TriStarGodAI`.

- **Without a token:** open **Review** in the app (or the issue list on GitHub), click
  **Approve on GitHub** and add the `approved` label to the issue (web or mobile). To reject,
  comment with the reason and close the issue as _not planned_.
- **With a token (optional):** paste a fine-grained personal access token in **Review** to
  approve and reject from the app. Limit it to the `takitotech-clinical/ecwitemkeys` repository,
  with _Issues: read and write_, _Metadata: read_ and an expiry of 90 days or less. The token
  stays in that browser's localStorage. Use **Forget token** on shared devices. **Bulk approve**
  produces one commit, and **Reject** needs a reason. It comments, labels the issue `rejected`
  and closes it.
- Either way, the **Apply proposals** workflow re-checks the approver. They must be in
  `config/approvers.json` and have Triage access or higher. The workflow then re-validates,
  commits `Apply #N: …`, closes the issue and redeploys.

**Conflicts.** Every proposal records a hash of the value the proposer saw. If the field has
changed since then, the queue marks the proposal _stale_ and the apply workflow labels it
`conflict` instead of overwriting the newer value. Ask the proposer to open a new proposal from
the app, or close it.

### Add an approver

Add their GitHub login to `config/approvers.json` and invite them as a collaborator with
**Triage** access.

### Rotate the review token

Only needed if you use one. Create a new fine-grained token as described above, then open **Review** → **Forget token** and
paste the new one. Revoke the old token on GitHub. Set a reminder before it expires.

### Change columns or category values

```sh
pnpm data:add-column notes --type text --multiline --label "Notes"   # appends a user column
pnpm data:add-column owner --type enum --values team-a,team-b
pnpm data:rename-column notes remarks_internal
pnpm data:remove-column notes          # asks for confirmation if any row has data there
```

To add a category value, append it to `values` of `category` in
`source/additional.schema.json`. Each column script writes canonical, validated files, so
commit the result as one change. The managed `added` and `expired` columns can't be edited,
renamed or removed.

### One-time GitHub setup

1. Push to `takitotech-clinical/ecwitemkeys` and make the repository public.
2. **Settings → Pages → Source:** _GitHub Actions_. Until this is set, the **Pipeline** workflow
   fails at _configure-pages_ and nothing is deployed. Then rerun it from **Actions → Pipeline →
   Run workflow**.
3. **Settings → Actions → Workflow permissions:** _Read and write_.
4. **Discussions:** enable them, create an **Item keys** category (open-ended discussion), and
   install the [giscus app](https://github.com/apps/giscus). Copy the `repo-id` and
   `category-id` from [giscus.app](https://giscus.app) into `GISCUS` in `src/lib/config.ts`.
   Until then, key details link to GitHub Discussions instead of embedding them.
5. **Labels:** the **Labels** workflow creates them on the first push. If they're missing, run it
   from **Actions → Labels → Run workflow**. The label definitions are `LABEL_STYLES` in
   `src/lib/config.ts`.
6. **Approvers:** `config/approvers.json` (currently the owner and `TriStarGodAI`).

## Development

Requires Node 24 and pnpm (the devcontainer has both).

```sh
pnpm install
pnpm dev              # builds the data bundle, then starts Vite on :5173
pnpm test             # unit tests (Vitest)
pnpm test:e2e         # Playwright: desktop Chrome, Pixel 7, iPhone 14
pnpm data:check       # the validation CI runs on source/*
pnpm lint && pnpm check
```

- `pnpm build` produces the static site in `build/`. `BASE_PATH` defaults to `/ecwitemkeys`; set
  `BASE_PATH=` to serve it from `/`.
- E2E tests build from `tests/fixtures/e2e` (set with `DATA_SOURCE_DIR`), a small dataset with
  new and expired keys.
- Proposal scripts can be tried without GitHub writes:
  `ISSUE_NUMBER=1 ISSUE_BODY="…" pnpm exec tsx scripts/proposal/validate.ts --dry-run`, and
  `scripts/proposal/apply.ts --dry-run` (which needs `GITHUB_TOKEN` to read issues).

### Workflows

| Workflow                | Trigger                                   | Does                                                  |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `ci.yml`                | PRs, pushes to other branches             | lint, svelte-check, unit tests, `data:check`, build   |
| `pipeline.yml`          | push to `main`, manual, nightly, called   | sync → build (with discussion counts) → deploy Pages  |
| `proposal-validate.yml` | proposal issue opened, edited or reopened | labels `proposal:valid`/`invalid` and one bot comment |
| `proposal-apply.yml`    | `approved` label added, manual            | applies every approved proposal, then the pipeline    |
| `discussion-sync.yml`   | discussion or comment created or deleted  | reruns the pipeline (debounced) for comment counts    |
| `labels.yml`            | label definitions changed, manual         | creates or updates the proposal labels                |
