# Manual zip upload (fallback only)

Use this **only if** Git pull + server build does not work.

Standard deploy: [GITHUB_RECONNECT.md](./GITHUB_RECONNECT.md)

```bash
npm run build:deploy   # creates mamsmain/ and mamsmain.zip
```

Upload to a separate folder (e.g. `mamsmain`) — not the standard Git layout.
