# 20i Node.js registration (repos/mams)

20i discovers an app when **both** exist in the app folder:

1. **`.env`** with `PORT=3000`
2. **`ecosystem.config.js`** with correct `cwd`

## Server path

```
/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams
```

Document root for `mams.mimitotracking.co.ug` must be **`repos/mams`**.

## Before Discover

| File in `repos/mams/` | Required |
|-----------------------|----------|
| `.env` | yes — `PORT=3000` |
| `ecosystem.config.js` | yes (from git) |
| `package.json` | yes |
| `hostinger-start.mjs` | yes |
| `backend/dist/index.js` | yes (after build) |
| `frontend/dist/index.html` | yes (after build) |

## Steps

1. Unregister old apps (e.g. from `mamsmain` or wrong path)
2. Remove extra `ecosystem.config.js` in other folders if present
3. **Discover applications** → wait 2–5 minutes
4. Register **`mams`**

## ecosystem.config.js (in repo)

```javascript
module.exports = {
  apps: [
    {
      name: 'mams',
      cwd: '/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      exp_backoff_restart_delay: 100,
    },
  ],
};
```

## If discovery fails

- `.env` missing or no `PORT=3000`
- Document root not `repos/mams`
- Wrong `cwd` in ecosystem
- Ask Elmot to enable **Node.js Optimised** on the package
