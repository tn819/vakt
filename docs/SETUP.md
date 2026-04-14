# GitHub Pages Setup for vakt Organization

## Step 1: Create GitHub Organization (2 minutes)

1. Go to https://github.com/account/organizations/new
2. Choose "Free" plan
3. Organization name: `vakt-dev` (or `vakt-project` if unavailable)
4. Contact email: your email
5. Create organization

## Step 2: Transfer Repository (2 minutes)

1. Go to https://github.com/tn819/vakt/settings
2. Scroll to "Danger Zone" → "Transfer ownership"
3. Type `vakt-dev/vakt` (or whatever org name you chose)
4. Confirm transfer

## Step 3: Enable GitHub Pages (1 minute)

1. Go to https://github.com/vakt-dev/vakt/settings/pages
2. Source: "Deploy from a branch"
3. Branch: `main` → `/docs`
4. Save

## Step 4: Update Config (if needed)

If you used a different org name than `vakt-dev`, update `docs/_config.yml`:

```yaml
url: https://YOUR-ORG-NAME.github.io
```

## Your Site Will Be At

**`https://vakt-dev.github.io`**

- No personal username
- Professional appearance
- Free forever
- Ready for custom domain later

## Done!

The site is already configured and ready. After transfer and Pages enablement, it will be live in ~2 minutes.
