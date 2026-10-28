# Contributing to Apna Dhanda

Thanks for helping! The repository is public to read, but only invited collaborators can push or open branches here. Because anyone can read it, never put a secret, key, password hash, backup or shop data in a commit.

## Workflow
1. **Never push to `main` directly.** `main` is what goes live.
2. Pull the latest main: `git checkout main && git pull`
3. Create a branch: `git checkout -b feature/short-name` (or `fix/short-name`)
4. Make your change, keep it focused on one thing.
5. Run the tests: `npm test` (and `npm run build` if you touched `site/admin-*.js`)
6. Commit with a clear message: `git commit -m "Add stock export to CSV"`
7. Push your branch: `git push -u origin feature/short-name`
8. Open a **Pull Request** on GitHub into `main` and fill in the template.
9. Krish reviews. Fix any comments, then he merges and deploys.

## Rules
- **Never commit secrets:** passwords, API tokens, `.env`, `*.secret`, `.dev.vars`, Cloudflare credentials.
- **Never commit real data:** database backups (`*.sql`), `local.sqlite`, customer names/phones, screenshots with real orders.
- Do not deploy to production and do not run commands with `--remote` against the live database. Only Krish deploys.
- Do not change `wrangler.apnadhanda.toml` bindings without asking.
- Keep the UI bilingual (Hindi + English) like the rest of the app.
- Add or update a test in `test/` for any API change.

## Questions
Ask Krish in the team chat before starting anything big.
