# Deploy MAMS PHP site (StackCP)

**No Node. No build. No port 3000.**

## Structure

Document root = **clone root** = `repos/mams`

```
/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams/
```

## Steps

1. **Manage Domains** → `mams.mimitotracking.co.ug` → Document Root:

```
repos/mams
```

2. Git Version Control → **Pull** `master`

3. Create **`.env`** in `repos/mams` (copy from `.env.example`):

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nsamba
DB_PASSWORD=Mimito@@2026
DB_NAME=mamsdb-35303030746b
API_PUBLIC_URL=https://mams.mimitotracking.co.ug
FRONTEND_URL=https://mams.mimitotracking.co.ug
JWT_SECRET=8f905f233b59625107bdaab8c1edc083f6ce9e60543450a0ff1982d81ddd4db0
ENCRYPTION_KEY=3c339ed094c4cfcfe44fd6b0c0c8726e
UPLOAD_DIR=uploads
```

4. **Change PHP Version** → **8.1+** (8.2 fine)

5. **Unregister** the old Node app `mams` (Registered Applications) — not used anymore

6. Test:

- https://mams.mimitotracking.co.ug/health  
- https://mams.mimitotracking.co.ug/auth/login  

## Notes

- `legacy/` is blocked by `.htaccess` (old Node source for developers only)
- Same MySQL data as before
