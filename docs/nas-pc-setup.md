# NAS deploy — one-time PC setup

Use this when setting up a **new Windows machine** to run `npm run deploy:nas`.
The NAS itself is already running Docker; this doc covers your PC and one NAS user
setting so deploys are fully automated (no SSH or sudo passwords).

**Do not put the NAS SSH password in `.env`.** Use an SSH key instead. Passwords in
files are easy to leak; OpenSSH does not read them from env vars anyway.

---

## Repo-specific paths

| | Homebase | BudgetTracker |
|---|---|---|
| Repo folder (PC) | `D:\Dev\Projects\Homebase` | `D:\Dev\Projects\BudgetTracker` |
| `NAS_PATH` | `/volume1/docker/homebase` | `/volume1/docker/BudgetTracker` |
| `NAS_SHARE` | `\\192.168.0.170\docker\homebase` | `\\192.168.0.170\docker\BudgetTracker` |
| App URL after deploy | `http://192.168.0.170:3000/` | `http://192.168.0.170:8080/` |

Adjust IP and paths if your NAS differs. Defaults match `scripts/deploy-nas.ps1`.

---

## 1. Generate an SSH key (on the PC)

PowerShell:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\id_ed25519_nas -C "nas-deploy"
```

Press Enter twice for **no passphrase** if you want zero-prompt deploys. A passphrase
is safer but you will type it (or use `ssh-agent`) on each deploy.

---

## 2. Install the public key on the NAS

Enter your NAS password **one last time**:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519_nas.pub | ssh wim@192.168.0.170 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Replace `wim` and `192.168.0.170` if yours differ.

**Manual fallback** (if the pipe command fails): SSH in, `nano ~/.ssh/authorized_keys`,
paste the single line from `Get-Content $env:USERPROFILE\.ssh\id_ed25519_nas.pub`.

---

## 3. SSH config (required for deploy scripts)

Deploy connects as `wim@192.168.0.170`, not the alias `nas`. The config must match
**both** the alias and the IP, or the key will not be used.

Create or edit `C:\Users\<you>\.ssh\config`:

```
Host nas 192.168.0.170
  HostName 192.168.0.170
  User wim
  IdentityFile ~/.ssh/id_ed25519_nas
  IdentitiesOnly yes
```

Verify (no password prompt):

```powershell
ssh nas "echo ok"
ssh wim@192.168.0.170 "echo ok"
```

Both must print `ok`. If only `ssh nas` works, fix the `Host` line — include the IP.

---

## 4. Docker group on the NAS (once per NAS user)

`docker compose version` works without group membership; **running** containers needs
access to `/var/run/docker.sock`.

SSH in interactively (sudo will ask for your NAS password here):

```powershell
ssh nas
```

On the NAS:

```bash
sudo usermod -aG docker wim
exit
```

Open a **new** SSH session and confirm:

```powershell
ssh nas "groups"
```

Output must include `docker`. Then:

```powershell
ssh nas "cd /volume1/docker/homebase && docker compose ps"
```

No `permission denied` on the Docker socket. Repeat with `BudgetTracker` in the path
if you deploy both apps.

This step is **per NAS user**, not per PC — you only redo it when creating a new
deploy user on the NAS.

---

## 5. Optional `.env` on Windows (connection settings only)

In the **repo root** on your PC (gitignored):

```env
NAS_HOST=192.168.0.170
NAS_USER=wim
NAS_PATH=/volume1/docker/homebase
NAS_SHARE=\\192.168.0.170\docker\homebase
NAS_BRANCH=main
NAS_SSH_PORT=22
```

Use BudgetTracker paths when deploying that repo. No passwords or tokens here.

---

## 6. Deploy

From the **service repo** (not `project-control-heim`):

```powershell
cd D:\Dev\Projects\Homebase
npm run deploy:nas
```

```powershell
cd D:\Dev\Projects\BudgetTracker
npm run deploy:nas
```

Variants:

```powershell
npm run deploy:nas -- -Push      # git push origin first
npm run deploy:nas -- -UseScp    # no SMB share: tarball via scp
```

Git Bash: `./scripts/deploy-nas.sh` (same env vars).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `wim@192.168.0.170's password:` during deploy | SSH config missing IP on `Host` line, or key not in `authorized_keys`. Re-check §2–3. |
| `permission denied` on `docker.sock` | User not in `docker` group. Re-check §4; use a **new** SSH session after `usermod`. |
| `sudo: a terminal is required` | Deploy scripts use plain `docker compose` (no sudo). Fix with §4, not sudoers. |
| `Could not read package.json` | Wrong directory — run from `Homebase` or `BudgetTracker`, not the control repo. |
| NAS share pull blocked | Uncommitted edits on `\\NAS\docker\...` — commit, stash, or discard on the share. |

---

## Quick checklist (new PC)

- [ ] `ssh-keygen` → `id_ed25519_nas`
- [ ] Public key in NAS `~/.ssh/authorized_keys`
- [ ] `~/.ssh/config` with `Host nas 192.168.0.170` + `IdentityFile`
- [ ] `ssh wim@192.168.0.170 "echo ok"` — no password
- [ ] NAS user in `docker` group (`groups` shows `docker`)
- [ ] `docker compose ps` works over SSH in project path
- [ ] Optional `.env` with `NAS_*` paths
- [ ] `npm run deploy:nas` from correct repo — finishes without prompts
