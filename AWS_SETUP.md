# AWS Setup Runbook — `testing` Elastic Beanstalk Environment

This is the concrete, ordered command list to stand up the `testing` environment
described in `DEPLOYMENT.md` (`develop → testing` branch mapping): one
single-instance Elastic Beanstalk environment running this app, backed by a
real RDS PostgreSQL instance, secrets in AWS Secrets Manager.

Region: **eu-west-1**. Everything below assumes that region unless noted.

You run every command in this file yourself — Claude has no AWS credentials
and cannot call AWS on your behalf. This doc exists so you don't have to
figure out the sequencing yourself. Every step below explains *what the
command actually does*, *why it's the right call here*, and *how to verify
it worked* before moving on — so if something fails partway through, you can
tell where.

Why this sidesteps the Cortex XDR / `npm install` problem on your laptop:
Elastic Beanstalk's Node.js platform runs `npm install` **on the EC2 instance
it manages**, not on your laptop. Your laptop only needs to zip and upload the
source (`eb deploy`), which doesn't touch the npm registry at all. The EB CLI
itself is a Python tool (not Node), so it isn't subject to the same block.

---

## 0. Prerequisites

**1. AWS CLI v2.** Download/run: https://awscli.amazonaws.com/AWSCLIV2.msi

This is the current major version — v1 is legacy and end-of-life, don't
install that instead if you find older instructions online. The MSI installer
adds `aws` to your PATH automatically. Open a **new** PowerShell window
afterward (PATH changes don't apply to already-open terminals) and confirm:

```powershell
aws --version
# aws-cli/2.x.x Python/3.x.x Windows/...
```

**2. Python 3, then the EB CLI.** Check first: `python --version`. If missing,
install from python.org (the Windows installer also offers to add Python to
PATH — check that box). Then:

```powershell
pip install awsebcli --upgrade --user
eb --version
```

`--user` installs into your user profile rather than system-wide, so it
doesn't need admin rights — but it lands in a `Scripts` folder
(`%APPDATA%\Python\Python3x\Scripts`) that may not be on PATH yet. If
`eb --version` says "not recognized," add that folder to PATH and open a new
terminal, or just run `py -m pip install --user awsebcli` and invoke the tool
with the full path it prints at the end of the install.

If `pip install` also gets blocked the same way `npm install` was (same
Cortex XDR symptom, different registry — PyPI instead of npmjs): it's worth
just trying first, since EDR policies are sometimes scoped to a specific
process/domain pair rather than "block this machine's internet access"
wholesale, so `python.exe` → `pypi.org` isn't necessarily blocked just
because `node.exe` → `registry.npmjs.org` is. If it is blocked too, same
workaround as before: run the install on an unmanaged machine and copy the
resulting files over, or get an IT exception for
`python.exe` → `pypi.org`/`files.pythonhosted.org`.

---

## 1. IAM user for provisioning (you, not the app)

This step creates *your* credentials for running AWS CLI/EB CLI commands.
It's separate from — and shouldn't be confused with — the EB **instance
role** the running app uses (set up in step 5), which is the thing
CLAUDE.md's least-privilege rule (§10/§12.8) is actually about. This IAM user
is just you, at a keyboard, provisioning infrastructure.

In the AWS Console → IAM → Users → Create user:

1. Name it something like `roy-cli`.
2. Attach policy **AdministratorAccess**. This grants essentially
   unrestricted access to every AWS service in the account — appropriate
   here because it's a one-person setup you're doing yourself, not something
   to hand to a CI pipeline or another teammate. Scope it down later if this
   user sticks around past initial setup.
3. Create an access key (the user's Security credentials tab → Create access
   key → choose "Command Line Interface (CLI)"). An access key is an
   Access Key ID + Secret Access Key pair — functionally a username/password
   for programmatic API calls. This is deliberately separate from your AWS
   account's root login; AWS strongly discourages using root credentials for
   day-to-day work.
4. On your laptop:
   ```powershell
   aws configure
   # AWS Access Key ID: <paste>
   # AWS Secret Access Key: <paste>
   # Default region name: eu-west-1
   # Default output format: json
   ```
   This writes the keys in plaintext to `%USERPROFILE%\.aws\credentials` and
   the region/output defaults to `%USERPROFILE%\.aws\config`. Treat that
   credentials file like a password — never commit it, never paste its
   contents anywhere (including to me).

**Verify it worked:**
```powershell
aws sts get-caller-identity
```
Should print JSON with `UserId`, `Account` (your 12-digit account ID — copy
this, you need it in step 5), and `Arn` ending in `user/roy-cli`. If this
errors, nothing past this point will work, so don't move on until it's clean.

---

## 2. Create the EB application + environment

From the project root (`C:\claude\automation`):

Elastic Beanstalk groups each OS generation + language runtime combination
into a "platform branch" (e.g. "Node.js 22 running on 64-bit Amazon Linux
2023"). Only the current generation, **Amazon Linux 2023 (AL2023)**, gets new
platform versions now — Amazon Linux 2 (AL2) is legacy. Versions inside
AL2023 change over time (Node 24 landed in late 2025), so rather than
hardcoding a specific version string here that may already be stale, list
what's currently offered and pick the newest Node.js one:

```powershell
eb platform list | findstr /i node
```

Then run `eb init` without `--platform` and answer the prompts (it will offer
that same list interactively, plus ask for an application name):

```powershell
eb init automation-platform --region eu-west-1
```

This writes `.elasticbeanstalk/config.yml` into the repo (app name, region,
default platform) — safe to commit, no secrets in it.

It will also ask about setting up SSH. Say yes and let it create a new EC2
key pair (or pick an existing one) — you'll want `eb ssh` later for the
one-off database seed. EB CLI saves the private key locally, typically under
`%USERPROFILE%\.ssh\`.

```powershell
eb create automation-testing --single --instance-type t3.micro
```

`--single` = one EC2 instance, no load balancer — cheapest option, fine for a
testing environment (a load-balanced environment can't trivially be
downgraded to single-instance later, so this is a real choice, not just a
flag). Under the hood, `eb create` runs a CloudFormation stack that
provisions: the EC2 instance, a dedicated security group, an instance
profile/IAM role (`aws-elasticbeanstalk-ec2-role` — you'll attach a policy to
this in step 5), an S3 bucket for uploaded app versions
(`elasticbeanstalk-eu-west-1-<account-id>`), and a CNAME endpoint like
`automation-testing.<random>.eu-west-1.elasticbeanstalk.com`.

This takes 5-10 minutes. While it runs, move to step 3 in another terminal —
or watch progress with:
```powershell
eb status
```

**Verify it worked:** `eb status` should eventually show `Health: Green` /
`Status: Ready`.

---

## 3. RDS PostgreSQL, locked to the EB instance only

**Don't make this publicly accessible.** Instead, allow inbound Postgres
traffic only from the EB environment's own security group — referencing the
*security group itself* as the allowed source (rather than an IP/CIDR range)
is the right call here because the EB instance's IP can change (replaced
instance, future scaling) but its security group membership won't.

> **Operational note:** if this EB environment is ever terminated and
> recreated from scratch, it gets a *new* security group ID, and the RDS
> ingress rule below — which references the old one — stops authorizing it.
> You'd need to re-run the `authorize-security-group-ingress` command with the
> new ID. Not a problem for normal deploys (`eb deploy` doesn't recreate the
> environment), only for `eb terminate` + a fresh `eb create`.

Once `eb create` finishes, find the EB instance's security group and the VPC
it landed in (EB launches into your account's **default VPC** unless told
otherwise — every region ships with one of these unless it's been
deliberately deleted, which is why we can just look this up rather than
create a VPC ourselves):

```powershell
aws elasticbeanstalk describe-environment-resources --environment-name automation-testing --query "EnvironmentResources.Instances[0].Id" --output text
```
```powershell
# substitute the instance id from above
aws ec2 describe-instances --instance-ids <INSTANCE_ID> --query "Reservations[0].Instances[0].[VpcId,SecurityGroups[0].GroupId]" --output text
```

That prints `<VPC_ID>` and `<EB_SG_ID>`. Now create a dedicated RDS security
group and allow that EB security group in:

```powershell
aws ec2 create-security-group --group-name automation-testing-rds-sg --description "RDS access for automation-testing" --vpc-id <VPC_ID>
# prints <RDS_SG_ID>

aws ec2 authorize-security-group-ingress --group-id <RDS_SG_ID> --protocol tcp --port 5432 --source-group <EB_SG_ID>
```

Create the instance (pick your own master password — don't reuse it
anywhere, and don't commit it):

```powershell
aws rds create-db-instance `
  --db-instance-identifier automation-testing `
  --db-instance-class db.t3.micro `
  --engine postgres `
  --allocated-storage 20 `
  --storage-type gp3 `
  --master-username automation_admin `
  --master-user-password "REPLACE_WITH_A_STRONG_PASSWORD" `
  --vpc-security-group-ids <RDS_SG_ID> `
  --backup-retention-period 1 `
  --no-multi-az `
  --no-publicly-accessible
```

What these choices mean: `--no-multi-az` skips provisioning a standby
replica in a second availability zone for automatic failover — roughly
doubles cost, not worth it for a testing environment. `--backup-retention-period 1`
is the minimum non-zero value, keeping one daily automated snapshot so you
can recover from a mistake without paying for a deep retention window.
`gp3` storage is the current generation — generally cheaper and faster than
the older `gp2` default. No `--db-name` was passed, so RDS creates the
default initial database literally named `postgres` (matches the
`/postgres` in the `DATABASE_URL` in step 4).

Wait for it to become available (takes ~5-10 min):

```powershell
aws rds wait db-instance-available --db-instance-identifier automation-testing
aws rds describe-db-instances --db-instance-identifier automation-testing --query "DBInstances[0].Endpoint.Address" --output text
```

That last command gives you `<RDS_ENDPOINT>` for the next step.

**Verify it worked (optional but worth doing before wiring up the app):**
SSH into the EB instance and confirm it can actually reach RDS on port 5432
— this isolates "is the security group rule right?" from "is the app
configured right?" as separate questions later:
```powershell
eb ssh
```
then on the instance:
```bash
nc -zv <RDS_ENDPOINT> 5432
# Connection to <endpoint> 5432 port [tcp/postgresql] succeeded!
```
`exit` to return to your local shell.

---

## 4. Set the EB environment variables

```powershell
eb setenv `
  NODE_ENV=production `
  PRISMA_SCHEMA=prisma/schema.postgres.prisma `
  DATABASE_URL="postgresql://automation_admin:REPLACE_WITH_A_STRONG_PASSWORD@<RDS_ENDPOINT>:5432/postgres" `
  JWT_SECRET="<generate a long random string>" `
  JWT_EXPIRES_IN=12h `
  AWS_REGION=eu-west-1 `
  AUTH_MODE=mock `
  QUEUE_MODE=local `
  SECRETS_MODE=aws `
  SCHEDULER_MODE=local `
  LOG_MODE=console `
  CONNECTOR_MODE=mock `
  INTEGRATIONS_ROOT=src/integrations
```

`eb setenv` isn't a passive config tweak — it triggers a real environment
update (the running instance gets the new env vars and the app restarts),
which takes a minute or two. Watch it with `eb status` or `eb events`.

What each variable actually does, and what breaks if it's wrong:

| Variable | Purpose | If missing/wrong |
|---|---|---|
| `NODE_ENV=production` | Used by Express/npm conventions throughout | Verbose dev logging, `npm install` would also install devDependencies unnecessarily |
| `PRISMA_SCHEMA` | Read by `scripts/prisma-postinstall.js` to pick the Postgres schema | Without it, `postinstall` falls back to the SQLite schema — the generated client would target the wrong provider and every DB call would fail |
| `DATABASE_URL` | Prisma's connection string | App fails to start / every DB query throws |
| `JWT_SECRET` | Signs/verifies login tokens (`src/core/auth.js`) | Anyone could forge tokens if left at a default/weak value — generate one, don't reuse the dev one in `.env.example` |
| `SECRETS_MODE=aws` | Routes credential secrets to Secrets Manager instead of a local file (`src/core/secrets.js`) | With `local`, saved integration secrets would silently vanish on the next deploy/instance replacement — EB's local disk doesn't persist across those |
| `QUEUE_MODE` / `SCHEDULER_MODE` (`local`) | Run jobs/cron in-process on the one EB instance | Setting these to `sqs`/`aws` right now would just throw — `src/core/queue.js` and `src/core/scheduler.js` deliberately aren't wired to real AWS services yet (see `DEPLOYMENT.md`) |

Generate `JWT_SECRET` with:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Verify it worked:**
```powershell
eb printenv
```
Lists every env var currently active on the environment — confirm
`DATABASE_URL`, `PRISMA_SCHEMA`, and `SECRETS_MODE` show the values you
expect before deploying.

---

## 5. Let the EB instance use Secrets Manager

The EB instance role (`aws-elasticbeanstalk-ec2-role` by default — created
automatically by `eb create` in step 2) needs permission to read/write the
secret paths this app uses (`automation/<integrationId>/<key>`, from
`src/core/secrets.js`). Without this, saving an integration credential in the
dashboard will fail with an `AccessDeniedException` surfaced from Secrets
Manager — worth knowing that signature if you hit it later.

Save this as `secrets-policy.json` (replace `<ACCOUNT_ID>` with the value
from `aws sts get-caller-identity` in step 1):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:CreateSecret",
        "secretsmanager:DeleteSecret"
      ],
      "Resource": "arn:aws:secretsmanager:eu-west-1:<ACCOUNT_ID>:secret:automation/*"
    }
  ]
}
```

Attach it as an **inline policy** — scoped to just this one role, simplest
for a single-purpose grant like this (versus a reusable managed policy,
which would make more sense if you were attaching the same permissions to
several roles):

```powershell
aws iam put-role-policy --role-name aws-elasticbeanstalk-ec2-role --policy-name automation-secrets-access --policy-document file://secrets-policy.json
```

(If your account has never created an EB environment before this one, this
role may not have existed before step 2 — by this point it should exist.
Confirm with `aws iam get-role --role-name aws-elasticbeanstalk-ec2-role`.)

**Verify it worked:**
```powershell
aws iam list-role-policies --role-name aws-elasticbeanstalk-ec2-role
# should list "automation-secrets-access"
aws iam get-role-policy --role-name aws-elasticbeanstalk-ec2-role --policy-name automation-secrets-access
# should print the policy JSON back
```

---

## 6. Deploy and smoke-test

**Before your first deploy**, make sure the predeploy hook is actually marked
executable in git — Windows/NTFS has no Unix executable bit, so a file
created on Windows is usually committed as mode `644`, and EB will fail the
deploy with a permission error trying to run it as mode `755`. `eb deploy`
bundles whatever git has committed, so set this once via Git Bash/WSL (or
any shell that understands `chmod`) and commit it:

```bash
chmod +x .platform/hooks/predeploy/01_db_push.sh
git add .platform/hooks/predeploy/01_db_push.sh
git commit -m "Make predeploy hook executable"
```

If you don't have a Unix-y shell handy, `git update-index --chmod=+x .platform/hooks/predeploy/01_db_push.sh` from plain PowerShell git works too — it edits the mode git records without needing `chmod` itself.

```powershell
eb deploy automation-testing
```

What this actually does, in order: zips the repo (per `.elasticbeanstalk` /
`.ebignore` rules) and uploads it to the S3 bucket from step 2 → EB unpacks it
on the instance and runs `npm install` (→ the `postinstall` script generates
the Postgres-flavored Prisma client because `PRISMA_SCHEMA` is set) → runs
`.platform/hooks/predeploy/01_db_push.sh` (creates all tables in RDS via
`prisma db push`, idempotent — safe to re-run on every future deploy too) →
starts the app via `npm start` → EB's health check (configured in
`.ebextensions/01_healthcheck.config` to hit `/health` instead of `/`)
confirms the instance is serving before marking the deploy successful.

```powershell
eb open
```

or check directly:

```powershell
curl https://<your-eb-url>/health
# {"status":"ok","time":"..."}
```

**If something fails partway through this**, pull the instance logs — this
is the single most useful debugging command for this whole setup, since it
includes the `npm install` output and the predeploy hook's stdout/stderr:

```powershell
eb logs
```

Common failure signatures to watch for in that output: a permissions error
on `01_db_push.sh` (the chmod step above wasn't done/committed), a Prisma
connection error (security group rule from step 3 isn't actually right, or
`DATABASE_URL` has a typo), or an `AccessDeniedException` from Secrets
Manager (step 5's policy didn't attach).

---

## 7. Seed the database (one-off)

The seed script needs to run somewhere with `DATABASE_URL` already pointed at
RDS — easiest is directly on the instance, reusing the SSH access set up in
step 2:

```powershell
eb ssh
```
This opens an SSH session into the running instance using the key pair
created back in step 2. Once connected:
```bash
source /opt/elasticbeanstalk/support/envvars
cd /var/app/current
node prisma/seed.js
```
`exit` when done to return to your local shell.

This creates the same seeded accounts as local dev (`admin@example.com` /
`Admin123!`, etc. — see `prisma/seed.js`). **Change these passwords or remove
the seed users before this environment is reachable by anyone but you.**

---

## 8. What's still local-only after this

Per `DEPLOYMENT.md`'s rollout checklist, this gets you RDS + Secrets Manager
+ EB only. Still not wired for this environment:

- Cognito (still `AUTH_MODE=mock` — real JWTs, no Cognito)
- SQS worker / `QUEUE_MODE=sqs`
- EventBridge Scheduler / `SCHEDULER_MODE=aws`
- CI/CD gating deploys on `npm test`

Those are separate follow-ups, not blockers for getting `testing` up.

---

## Cost note

Roughly: `t3.micro` EC2 + `db.t3.micro` RDS + 20GB gp3 storage is a few
dollars a day if not covered by free tier (`db.t3.micro`/`t3.micro` are
typically free-tier eligible on accounts under 12 months old — check
yours). Nothing here auto-scales, so cost won't run away unexpectedly.

## Tearing it down

```powershell
eb terminate automation-testing
aws rds delete-db-instance --db-instance-identifier automation-testing --skip-final-snapshot
aws ec2 delete-security-group --group-id <RDS_SG_ID>
```

Note `eb terminate` deletes the EC2 instance and its security group but
**not** the S3 app-version bucket from step 2 by default — harmless to leave,
but delete it manually later if you want a fully clean account.
