# Deploy MAMS on StackCP → mams.mimitotracking.co.ug

**Live domain:** https://mams.mimitotracking.co.ug  
**cPanel Git path (as shown in UI):**  
`/home/virtual/vps-311004/2/27d5d7288d//home/virtual/vps-311004/2/27d5d7288d/mams.mimitotracking.co.ug`  
**Resolved on disk:**  
`/home/virtual/vps-311004/2/27d5d7288d/home/virtual/vps-311004/2/27d5d7288d/mams.mimitotracking.co.ug`  
**Node app root:** that path + `/platform`  
**GitHub:** `mimitotech/unified-fleet-platform` (branch `master`)  
**SSH (inbound):** `mimitotracking.co.ug@ssh.lhr.stackcp.com:39550`

> cPanel prefixes `/home/virtual/vps-311004/2/27d5d7288d/` onto whatever you type.  
> Entering the full absolute path created a nested path — that clone **works**; we point the domain/Node app at it instead of re-cloning.

```
GitHub (private) --deploy key--> cPanel Git Version Control
                                      ↓
         .../mams.mimitotracking.co.ug/   (full repo clone)
                                      ↓
         .../mams.mimitotracking.co.ug/platform/   ← Node 22 app root
                                      ↓
                                   MySQL
```

## A. Keep the working Git clone

Do **not** re-clone. Current working repo:

| Field | Value |
|-------|--------|
| Name | `mams` |
| Path (UI) | `/home/virtual/vps-311004/2/27d5d7288d//home/virtual/vps-311004/2/27d5d7288d/mams.mimitotracking.co.ug` |
| Branch | `master` @ `5611c56` |
| Remote | `https://github.com/mimitotech/unified-fleet-platform.git` |

Enable automatic deployment for branch **`master`**. Deploy tasks come from  
[`.cpanel.yml`](../../.cpanel.yml) once that file is on `master` (commit/push from this Mac).

## B. Point the domain + Node.js at this clone

### 1) Manage Domains — document root

Change **mams.mimitotracking.co.ug** document root to the real clone folder:

```
/home/virtual/vps-311004/2/27d5d7288d/home/virtual/vps-311004/2/27d5d7288d/mams.mimitotracking.co.ug
```

(same as the git path with `//` normalized to `/`)

### 2) Setup Node.js App

| Setting | Value |
|---------|--------|
| Node.js version | **22.x** |
| Application root | `/home/virtual/vps-311004/2/27d5d7288d/home/virtual/vps-311004/2/27d5d7288d/mams.mimitotracking.co.ug/platform` |
| Application startup file | **`hostinger-start.mjs`** |
| Application URL | `mams.mimitotracking.co.ug` |

Create **once** on the server: `platform/.env` from `platform/deploy/hostinger.env.example`:

```
API_PUBLIC_URL=https://mams.mimitotracking.co.ug
FRONTEND_URL=https://mams.mimitotracking.co.ug
VITE_API_URL=
DB_USER=…
DB_PASSWORD=…
DB_NAME=…
JWT_SECRET=…
ENCRYPTION_KEY=…
REDIS_DISABLED=1
```

Import schema: `platform/database/mysql/ufp_complete_schema.sql` in phpMyAdmin if needed.

## C. Inbound SSH key (Mac / GitHub Actions → cPanel)

Still paste this into **SSH Access → Add New Public Key** if not done yet  
(handle: `mams-github-deploy`):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIINSs8uMAxKLWD8cz5tU3s22wxHB+3gD8DriWlrzFtDT mams-deploy@mimitotech/unified-fleet-platform
```

First key can take up to **30 minutes** to activate.  
If SSH is IP-restricted to `41.210.143.122` only, GitHub Actions cannot deploy — relax that for CI, or rely on cPanel Git pulls only.

Test from this Mac after activation:

```bash
ssh mams-cpanel
```

## D. What happens on each push

1. Push to `master` on GitHub.  
2. cPanel Git pulls into the document-root path.  
3. `.cpanel.yml` runs build inside `platform/`.  
4. `tmp/restart.txt` soft-restarts the Node app.

Optional parallel path: GitHub Actions workflow  
`.github/workflows/deploy-cpanel.yml` (needs inbound SSH working + secrets already set).

## E. Checklist

- [ ] Inbound public key added in SSH Access  
- [ ] Deploy private key imported in cPanel (Option 1) **or** HTTPS PAT (Option 2)  
- [ ] Git Version Control clone with path/name above  
- [ ] Node 22 app root = `…/platform`, entry `hostinger-start.mjs`  
- [ ] `platform/.env` with `mams.mimitotracking.co.ug` URLs  
- [ ] Pull `master` once and confirm site responds at https://mams.mimitotracking.co.ug  
