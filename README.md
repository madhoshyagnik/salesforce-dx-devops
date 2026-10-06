# Salesforce DevOps with Salesforce DX (Modern Guide)

A minimal, practical, and up-to-date guide replacing legacy 60-page slides and multi-hour video courses. Covers modern Salesforce CLI (`sf`), source-driven development, scratch orgs, sandboxes, local LWC testing, Apex testing, local Jenkins with Docker Compose, and CI/CD pipelines.

---

## 1. The Core Mental Model

```
                    ┌─────────────────────────┐
                    │ Git (Source of Truth)   │
                    └────────────┬────────────┘
                                 │ checkout / commit
                    ┌────────────▼────────────┐
                    │ Local DX Project        │
                    │ (force-app, LWC, Apex)  │
                    └──────┬───────────┬──────┘
       sf project deploy   │           │   sf project deploy
                           ▼           ▼
             ┌────────────────┐     ┌────────────────┐
             │  Scratch Org   │     │ Sandbox / Prod │
             │  (Disposable)  │     │  (Persistent)  │
             └────────────────┘     └────────────────┘
```

- **Git vs Salesforce DX**: Git is your version control system (commits, branches, pull requests). Salesforce DX is **not** version control; it is the tooling and metadata format that enables source-driven development, allowing Git to serve as the single source of truth instead of an org.
- **Frontend Layers**: Modern development centers on **Lightning Web Components (LWC)** (standard web components, shadow DOM, Jest). Older stacks like Aura components and Visualforce are legacy.
- **The 4 Org Types**:
  | Org Type                     | Purpose                                                    | Persistence           | Source Tracking                             |
  | :--------------------------- | :--------------------------------------------------------- | :-------------------- | :------------------------------------------ |
  | **Dev Hub**                  | Management org that creates and tracks scratch orgs        | Persistent            | No                                          |
  | **Scratch Org**              | Disposable, empty sandbox for single feature branches & CI | Temporary (1–30 days) | **Yes** (Default)                           |
  | **Sandbox**                  | Replica of production for staging, integration, UAT        | Persistent            | Supported only for Dev/DevPro if enabled    |
  | **Developer Edition / Prod** | Personal dev org or live production environment            | Persistent            | **No** (Deploys via manifest or source dir) |

### Source Tracking vs Git Tracking

- **Git** tracks diffs between commits on your file system.
- **Source Tracking** is an internal Salesforce feature that monitors diffs between your **local files** and the **metadata inside an org**.
- Scratch orgs track changes automatically (`sf project deploy/retrieve` detects what changed).
- Sandboxes only support source tracking if enabled under **Setup > Dev Hub > Enable Source Tracking in Developer and Developer Pro Sandboxes**.
- Free Developer Edition orgs and Production **never** support source tracking. For these, use manifest-based or direct deploys (`sf project deploy start --manifest ...`).

---

## 2. Prerequisites & Project Setup

- **Salesforce CLI**: Modern CLI (`sf`) is required. Legacy `sfdx` commands are deprecated.
  ```bash
  sf --version
  ```
- **Node.js**: v18+ or v20 LTS (required for LWC Jest tests and linters).
- **VS Code**: With the _Salesforce Extension Pack_.
- **Do you need Java locally?** Not for basic `sf` CLI commands. Java (JDK 11 or 17) is only required if running local Jenkins or the PMD engine inside Salesforce Code Analyzer.

### Creating a Project From Scratch (vs Just Cloning)

Cloning a Git repo is fine when onboarding to an existing team, but it shouldn't be your primary mental model for learning Salesforce DX. To truly understand the framework, you should know how to spin up a project from scratch:

```bash
# Generate a clean, official DX project structure
sf project generate --name my-salesforce-project
cd my-salesforce-project
```

This scaffolds the core project structure:

```
salesforce-dx-devops/
├── .github/workflows/ci.yml       # GitHub Actions CI workflow
├── docker-compose.yml             # Local Jenkins via Docker Compose
├── docker/Dockerfile.jenkins      # Jenkins image with sf CLI & Node preinstalled
├── Jenkinsfile                    # Jenkins Declarative Pipeline
├── config/
│   └── project-scratch-def.json   # Scratch org blueprint
├── force-app/main/default/
│   ├── classes/                   # Apex classes & test classes
│   └── lwc/                       # Lightning Web Components & Jest tests
├── package.json                   # Node dependencies, scripts, linters
└── sfdx-project.json              # DX Project configuration & API version
```

---

## 3. Dev Hub & Scratch Org Management

### Authorize Dev Hub

```bash
# Interactive web login
sf org login web --alias ProdOrg --set-default-dev-hub

# Verify connected orgs
sf org list --all
```

### Create a Scratch Org

```bash
sf org create scratch \
  --target-dev-hub ProdOrg \
  --definition-file config/project-scratch-def.json \
  --alias MyScratchOrg \
  --duration-days 7 \
  --set-default
```

### Troubleshooting Common Scratch Org Errors

- **`LIMIT_EXCEEDED`**: Dev Hub has reached maximum active scratch orgs. Delete inactive ones: `sf org delete scratch --target-org <alias> --no-prompt`.
- **`ProblemDeployingSettings`**: Definition file contains obsolete settings (e.g., deprecated `enableSetPasswordInApi` in `settings`). Keep `project-scratch-def.json` minimal.
- **`NamedOrgNotFoundError`**: The CLI does not recognize the alias locally. Run `sf org list --all` to inspect local auth records.
- **Incomplete creation**: If creation times out or disconnects:
  ```bash
  sf org resume scratch --use-most-recent
  ```

---

## 4. Source-Driven Development Workflow

```bash
# 1. Preview changes (no actual deploy/retrieve)
sf project deploy preview --target-org MyScratchOrg
sf project retrieve preview --target-org MyScratchOrg

# 2. Deploy local metadata to org (replaces old force:source:push)
sf project deploy start --target-org MyScratchOrg

# 3. Retrieve metadata changes made in org Setup (replaces old force:source:pull)
sf project retrieve start --target-org MyScratchOrg

# 4. Open org in browser
sf org open --target-org MyScratchOrg
```

### The "Nothing to Deploy" Gotcha (How Source Tracking Works)

A very common gotcha when deploying to a scratch org:

1. **First Deploy**: You run `sf project deploy start --target-org MyScratchOrg`. Everything uploads cleanly, and Salesforce DX source tracking marks your local files and scratch org as synchronized.
2. **Immediate Second Deploy**: If you run `sf project deploy start` again without editing anything, the CLI says **"No changes detected to deploy"** (nothing happens).
3. **Why this happens**: Unlike a simple file copy or FTP, Salesforce DX tracks state. It only deploys what has changed since the last sync.
4. **How to deploy again**:
   - **Normal flow (Make a local change)**: Edit an existing file, or create a new one.
     > 💡 **Golden Rule**: In Salesforce, every code file **must have its companion XML metadata file**! For example, if you create `MyClass.cls`, you must also create `MyClass.cls-meta.xml` right next to it. If you only create the `.cls` file without the `.cls-meta.xml`, Salesforce will throw an error and fail the deploy.
   - **Force Deploy (Bypass source tracking)**: If you ever want to redeploy all files regardless of what source tracking thinks, target the source directory directly:
     ```bash
     sf project deploy start --source-dir force-app/main/default --ignore-conflicts
     ```

---

## 5. Sandboxes (Modern CLI Approach)

```bash
# Authorize production org that owns sandbox licenses
sf org login web --alias ProdOrg

# Create a Developer Sandbox
sf org create sandbox \
  --name Dev1 \
  --license-type Developer \
  --target-org ProdOrg \
  --alias MyDevSandbox \
  --wait 30

# Resume sandbox creation if queued
sf org resume sandbox --job-id <JOB_ID>

# Refresh or delete a sandbox
sf org refresh sandbox --name Dev1 --target-org ProdOrg
sf org delete sandbox --target-org MyDevSandbox --no-prompt
```

---

## 6. Testing & Quality Gates

This project contains both backend (Apex) and frontend (LWC) unit tests:

### 1. Frontend LWC Jest Tests (Local & Fast)

Runs locally via Jest in Node.js without needing any active Salesforce org connection:

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:unit:watch

# Code formatting & linting
npm run lint
npm run prettier:verify
```

### 2. Backend Apex Unit Tests (Platform)

Requires an active scratch org or sandbox:

```bash
# Run tests via npm shortcut or sf CLI
npm run test:apex

# Direct CLI command with code coverage
sf apex run test \
  --target-org MyScratchOrg \
  --test-level RunLocalTests \
  --code-coverage \
  --result-format human \
  --wait 5
```

### 3. Static Code Analysis (Modern Code Analyzer)

Replaces manual Windows PMD 6.30 downloads:

```bash
# Run Salesforce Code Analyzer v5 across all rules
sf code-analyzer run --workspace .
```

### 4. Apex Replay Debugger

1. In VS Code, set breakpoints or checkpoints (maximum of 5 checkpoints per session).
2. Generate a trace flag: `sf apex tail log` or set debug log in Developer Console.
3. Run code to trigger the log.
4. Open the `.log` file in VS Code -> Right-click -> **Launch Apex Replay Debugger**.

---

## 7. Local Jenkins Setup (Docker Compose)

The repository includes a ready-to-use Docker Compose configuration with a custom image containing:

- Jenkins LTS (JDK 17)
- Node.js 20 LTS & npm
- Salesforce CLI (`sf`) preinstalled globally

### Spin Up Jenkins

```bash
# From the project root:
docker compose up -d

# Check container status
docker compose ps
```

- **Web UI**: [http://localhost:8080](http://localhost:8080)
- **Initial Admin Password**:
  ```bash
  docker exec -it salesforce-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
  ```
- **Install Plugins**: Complete setup wizard and install **Git**, **Pipeline**, **Credentials Binding**, and **JUnit** plugins.

---

## 8. CI/CD Pipelines: Jenkins & GitHub Actions

Both pipelines can peacefully coexist in the same repository:

- `Jenkinsfile` is detected by Jenkins.
- `.github/workflows/ci.yml` is detected by GitHub Actions.

```
                      CI/CD Pipeline Flow
┌──────────────────┐
│  Checkout Code   │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ LWC Jest & Lint  │  (npm test, npm run lint)
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Dev Hub Auth     │  (Headless JWT or SFDX Auth URL)
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Create Scratch   │  (sf org create scratch -d 1)
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Deploy Metadata  │  (sf project deploy start)
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Run Apex Tests   │  (sf apex run test --code-coverage)
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Delete Scratch   │  (sf org delete scratch --no-prompt)
└──────────────────┘
```

### Headless CI Authentication Methods

CI systems cannot open interactive browser windows. Use one of two headless methods:

#### Method A: SFDX Auth URL (Fastest for GitHub Actions)

1. Export the auth URL from your local machine:
   ```bash
   sf org display --target-org ProdOrg --verbose --json
   ```
2. Copy the `sfdxAuthUrl` value and save it as secret `SFDX_AUTH_URL` in GitHub repository settings.
3. In CI:
   ```bash
   echo "$SFDX_AUTH_URL" > auth.txt
   sf org login sfdx-url --sfdx-url-file auth.txt --alias DevHub --set-default-dev-hub
   rm -f auth.txt
   ```

#### Method B: JWT Bearer Flow (Enterprise Standard for Jenkins)

1. Generate an RSA private key and certificate:
   ```bash
   openssl req -x509 -sha256 -nodes -days 3650 -newkey rsa:2048 -keyout server.key -out server.crt
   ```
2. In Salesforce Setup, create a **Connected App**:
   - Enable OAuth Settings -> Check **Use digital signatures** -> Upload `server.crt`.
   - Scopes: `api`, `web`, `refresh_token, offline_access`.
   - Manage Connected App -> Set Permitted Users to _Admin approved users are pre-authorized_ and assign your Admin Profile or Permission Set.
3. In Jenkins Credentials Manager, configure:
   - `salesforce-jwt-key`: Secret file (`server.key`)
   - `salesforce-connected-app-client-id`: Secret text (Consumer Key from Connected App)
   - `salesforce-devhub-username`: Secret text (Dev Hub Admin Username)

---

## 9. Modern Command Cheat Sheet (sf vs legacy sfdx)

| Task                   | Legacy Command (`sfdx`)             | Modern Command (`sf`)                     |
| :--------------------- | :---------------------------------- | :---------------------------------------- |
| **Check Version**      | `sfdx --version`                    | `sf --version`                            |
| **List Orgs**          | `sfdx force:org:list`               | `sf org list --all`                       |
| **Browser Login**      | `sfdx auth:web:login`               | `sf org login web`                        |
| **JWT Headless Login** | `sfdx auth:jwt:grant`               | `sf org login jwt`                        |
| **Auth URL Login**     | `sfdx auth:sfdxurl:store`           | `sf org login sfdx-url`                   |
| **Create Project**     | `sfdx force:project:create`         | `sf project generate`                     |
| **Create Scratch Org** | `sfdx force:org:create`             | `sf org create scratch`                   |
| **Resume Scratch Org** | _(none/manual)_                     | `sf org resume scratch --use-most-recent` |
| **Delete Scratch Org** | `sfdx force:org:delete`             | `sf org delete scratch --no-prompt`       |
| **Deploy Source**      | `sfdx force:source:push`            | `sf project deploy start`                 |
| **Retrieve Source**    | `sfdx force:source:pull`            | `sf project retrieve start`               |
| **Deploy Preview**     | _(none)_                            | `sf project deploy preview`               |
| **Run Apex Tests**     | `sfdx force:apex:test:run`          | `sf apex run test`                        |
| **Create User**        | `sfdx force:user:create`            | `sf org create user`                      |
| **Create Sandbox**     | `sfdx force:org:create -t sandbox`  | `sf org create sandbox`                   |
| **Static Analysis**    | Standalone PMD / `sfdx scanner:run` | `sf code-analyzer run`                    |
