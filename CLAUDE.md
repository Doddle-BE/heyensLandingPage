## Deploy Configuration (configured by /setup-deploy)
- Platform: SSH/rsync (custom)
- Production URL: https://heyens.be
- Deploy workflow: `.github/workflows/deploy.yml` (auto on push to main)
- Deploy status command: HTTP health check
- Merge method: merge
- Project type: static web app

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: push to main
- Deploy status: poll production URL
- Health check: https://heyens.be
- Remote host / port / user: stored in repo secrets (DEPLOY_HOST, DEPLOY_PORT, DEPLOY_USER)
- Remote path: stored in repo secret DEPLOY_PATH
