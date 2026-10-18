# Salesforce DevOps with Salesforce DX (Modern Guide)

A practical, grounded guide for DevOps engineers working with Salesforce. Covers modern Salesforce CLI (`sf`), source-driven development, metadata vs data, scratch orgs, sandboxes, local LWC testing, Apex testing, local Jenkins with Docker Compose, and headless CI/CD pipelines.

---

## 1. The DevOps Engineer's Mental Model: Why Does This Exist & What Is Your Role?

If you come from a standard cloud-native background (AWS, GCP, Kubernetes, Terraform, Docker, Python, Go), Salesforce often feels alien and confusing at first. Here is the plain-English mental model.

### Why haven't you encountered Salesforce in traditional DevOps?

In tech startups and consumer SaaS, teams build custom applications from scratch: custom backend APIs (Node/Python/Go), custom database schemas in PostgreSQL, and custom auth.

In large enterprises (banks, healthcare, telecom, insurance, retail), companies do not build their core CRM, billing, and customer workflows from scratch. They run on **Salesforce** — a multi-tenant Platform-as-a-Service (PaaS) and Software-as-a-Service (SaaS).

### The Problem: The Legacy "ClickOps" Era

Historically, Salesforce development was purely "ClickOps":

- Admins and developers logged directly into a shared browser sandbox or production org.
- They created database tables, added fields, configured permissions, and wrote triggers **by clicking buttons in the Salesforce web UI**.
- **There was no Git, no pull requests, no CI/CD, and no automated testing.** If two developers modified the same screen, they silently overwrote each other's work. Deployments were done by manually clicking checkboxes in "Change Sets" like moving files in 1998.

### What is Salesforce DX (Developer Experience)?

Salesforce introduced **Salesforce DX (SFDX)** to bring Salesforce into modern software engineering:

1. **Git is the Single Source of Truth**: Changes are tracked as code files in a Git repository, not trapped inside a remote Salesforce database.
2. **Local Development**: Developers write code locally in VS Code instead of a browser text area.
3. **Automated CI/CD**: Deployments, testing, and validations are automated via Jenkins or GitHub Actions.

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

---

## 2. Metadata vs Data: The Concept That Explains Everything

This is the single most important concept in Salesforce that upstream tutorials fail to explain clearly:

| Concept      | What It Is                                                                                                              | Examples in Salesforce                                                                                                                                                  | Stored in Git?                                               |
| :----------- | :---------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------- |
| **METADATA** | The **structure, schema, logic, and configuration** of the application. Everything that defines _how the system works_. | Database tables (`CustomObject`), columns (`CustomField`), UI layouts, Validation Rules, Permissions, Apex classes (`.cls`), Lightning Web Components (`.js`, `.html`). | **YES** (Stored as XML, JSON, and JS in `force-app/`)        |
| **DATA**     | The **actual business records and rows** created by end users.                                                          | "Acme Corp" (Account record), "John Doe" (Contact record), "Invoice #1042 for $5,000".                                                                                  | **NO** (Lives in the org's database; never committed to Git) |

> 💡 **Key Takeaway**: When you run CI/CD, deploy code, or commit to Git, **you are deploying METADATA**. Your local `force-app/main/default/` folder is simply the local file representation of that metadata extracted from Salesforce.

---

## 3. What Does a DevOps Engineer Actually Do for Salesforce?

As a DevOps engineer, you are **not** writing business Apex code or designing UI buttons. You build and maintain the **engineering delivery pipeline**:

1. **Automated Ephemeral CI Environments**: When a developer opens a Pull Request, your pipeline (Jenkins or GitHub Actions) automatically spins up a clean, disposable **Scratch Org**, deploys the branch metadata, executes unit tests, checks code coverage, and destroys the scratch org when done.
2. **Quality Gates & Static Analysis**: Enforcing automated linting, LWC Jest tests, Apex unit tests, and Salesforce Code Analyzer (PMD / security rules) before any code can merge.
3. **Headless Authentication**: Setting up non-interactive JWT Bearer OAuth flows with RSA certificates so automated CI agents can authenticate to Salesforce without human browser logins.
4. **Environment Promotion & Release Management**: Promoting metadata cleanly across the multi-tier enterprise pipeline:
   `Feature Branch (Scratch Org)` → `develop (Dev Sandbox)` → `release (UAT/Staging Sandbox)` → `main (Production)`.

---

## 4. The Org Landscape: Free Developer Account vs Sandboxes vs Scratch Orgs

### Does your free Developer Edition account have Sandboxes?

**No.** Free Developer Edition accounts (from `developer.salesforce.com`) do **not** include sandboxes. Sandboxes are only provided with paid enterprise contracts.

However, your free Developer Edition org has **Dev Hub**! When you enable Dev Hub under **Setup > Dev Hub**, your free account can create disposable **Scratch Orgs** (typically 3 active scratch orgs simultaneously).

### Understanding the 4 Org Types

> [!NOTE]
> **"Org" vs "Sandbox"**: "Org" is the generic umbrella term for any Salesforce environment (Production, Sandboxes, Scratch Orgs, Dev Edition). A "Sandbox" is specifically a clone provisioned from a paid Production org.

| Org Type        | What it is                              | Typical use                                   | Persistence           | Source Tracking ("Sync")                     |
| :-------------- | :-------------------------------------- | :-------------------------------------------- | :-------------------- | :------------------------------------------- |
| **Dev Hub**     | Management org with licensing power     | Authorizes CI and spawns scratch orgs         | Permanent             | No                                           |
| **Scratch Org** | Disposable, empty org spun up via CLI   | Feature development, PR testing, CI pipelines | Ephemeral (1–30 days) | **Yes (Default)**                            |
| **Sandbox**     | Replica of a paid production org        | Integration testing, staging, client UAT      | Permanent             | Supported **only** for Dev/DevPro if enabled |
| **Production**  | Live system where real business happens | End-user operations and final deployments     | Permanent             | **Never supported**                          |

### What is "Source Tracking" (The Sync Engine)?

In Salesforce DX, "sync" is called **Source Tracking**:

- It is a bidirectional diff engine that tracks changes between your **local Git repository** and the **remote Salesforce org**.
- If you edit a file locally, `sf project deploy start` deploys only that file.
- If an admin edits a field in the org UI, `sf project retrieve start` pulls down only that change into your local Git repo.
- If both changed, it flags a conflict before overwriting.

#### Why isn't Source Tracking available in Production or Partial/Full Sandboxes?

- **Scratch Orgs**: Built for a single developer working on a single branch. Source tracking is enabled by default.
- **Developer / Developer Pro Sandboxes**: Can have source tracking if enabled by an admin in Setup.
- **Production & Full Sandboxes**: **Never supported.** Thousands of end users, automated integrations, and background jobs modify records and configurations constantly in Production. Salesforce cannot maintain a real-time bidirectional diff ledger with your local laptop. For Production, deployments are always explicit (via targeted directories or manifests).

### Source-Driven (Scratch Orgs) vs Org-Driven (Sandboxes & Production)

In standard cloud DevOps (Terraform, Docker, Kubernetes), Git is the absolute source of truth—if an environment is deleted, Git and IaC rebuild 100% of it from zero. In Salesforce, the reality is nuanced:

- **Scratch Orgs are truly Source-Driven**: They start 100% empty from a JSON shape definition. They have no metadata until deployed from Git (`sf project deploy start`). If deleted, Git can reproduce an identical one in minutes.
- **Production & Sandboxes are historically Org-Driven**: You cannot run `sf org create production` from Git—Production is contractually provisioned by Salesforce as a persistent multi-tenant database. Sandboxes are cloned from _Production_ (inheriting licenses, managed packages, and schema), not built from Git.
- **The ClickOps Drift Problem**: Admins frequently configure fields, validation rules, or flows directly in the Production or Sandbox web UI without touching Git. This introduces **configuration drift**.
- **The DevOps Mandate (Source-Governed)**: Persistent orgs only become "source-driven" when DevOps enforces strict discipline: locking down production UI permissions, gating changes through Git PRs, automating CI/CD deployments, and running drift detection to pull untracked metadata back into Git.

---

## 5. Prerequisites & Project Setup

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

## 6. Dev Hub & Scratch Org Management

### Authorize Dev Hub

The Dev Hub is the org that Salesforce uses to create and manage scratch orgs. It is not the scratch org itself. Enable Dev Hub under **Setup > Dev Hub**, then authorize locally:

```bash
# Interactive web login
sf org login web --alias DevHub --set-default-dev-hub

# Verify connected orgs
sf org list --all

# Set target Dev Hub globally (optional)
sf config set target-dev-hub=DevHub
```

### Create a Scratch Org

A scratch org is a temporary, configurable, and source-driven environment (default lifetime: 7 days, configurable 1–30 days):

```bash
sf org create scratch \
  --target-dev-hub DevHub \
  --definition-file config/project-scratch-def.json \
  --alias MyScratchOrg \
  --duration-days 7 \
  --set-default
```

#### A Minimal Definition File (`config/project-scratch-def.json`)

```json
{
  "orgName": "Demo company",
  "edition": "Developer",
  "features": ["EnableSetPasswordInApi"],
  "settings": {
    "lightningExperienceSettings": {
      "enableS1DesktopEnabled": true
    }
  }
}
```

> 💡 **Features vs Settings**: `"EnableSetPasswordInApi"` is fully supported in the `"features"` array (enabling CLI commands like `sf org generate password` without knowing the old password). However, placing `enableSetPasswordInApi` under the `"settings"` block causes a `ProblemDeployingSettings` error in modern API versions.

### Scratch Org Lifecycle & Troubleshooting

A scratch-org creation command executes across 6 distinct stages:

1. **Prepare request**: Validates local definition file and parameters.
2. **Send request**: Submits the scratch-org request to the Dev Hub.
3. **Wait for the org**: Waits while Salesforce spins up the org.
4. **Authenticate the new org locally**: Exchanges tokens and stores auth metadata.
5. **Deploy scratch-org settings**: Applies settings from the definition file.
6. **Done**: Outputs username and marks org ready.

#### If Creation Times Out or is Incomplete

```bash
# Resume by Request ID
sf org resume scratch --job-id <REQUEST_ID>

# Resume most recent request
sf org resume scratch --use-most-recent
```

If the resume finishes successfully, you will see `Your scratch org is ready.`

#### Errors & Actions

| Error                            | Meaning / Action                                                                                                                                                                                                 |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`LIMIT_EXCEEDED`**             | Dev Hub has reached active scratch-org allocation. Delete unused ones (`sf org delete scratch --target-org <alias> --no-prompt`) or wait for expiration.                                                         |
| **`NamedOrgNotFoundError`**      | CLI has no local authorization record for the referenced org/alias. Check `sf org list --all`.                                                                                                                   |
| **`AuthInfoOverwriteError`**     | CLI already has auth data for that username. Avoid adding logins blindly; identify the existing record with `sf org list`.                                                                                       |
| **`ProblemDeployingSettings`**   | A setting in the definition file is obsolete or invalid (e.g., placing `enableSetPasswordInApi` under `"settings"` instead of `"features"`). Move it to `"features"` or remove the invalid setting, then resume. |
| **`expired authorization code`** | Browser login code is short-lived. Start a fresh login flow; do not reuse an old code.                                                                                                                           |

#### Most Useful Inspection Commands

```bash
sf org list
sf org list --all
sf org display --target-org MyScratchOrg
sf org open --target-org MyScratchOrg
```

> ⚠️ **Troubleshooting Rule**: Do not change the definition file, authentication, aliases, and org state all at once. Change one thing at a time, rerun the relevant command, and read the exact lifecycle stage that failed.

---

## 7. Source-Driven Development Workflow

The legacy commands `force:source:push` and `force:source:pull` are replaced by the modern `sf project deploy/retrieve` family:

```bash
# 1. Preview changes before applying (no actual deploy/retrieve)
sf project deploy preview --target-org MyScratchOrg
sf project retrieve preview --target-org MyScratchOrg

# 2. Deploy local metadata to org
sf project deploy start --target-org MyScratchOrg

# Deploy a specific directory only
sf project deploy start --target-org MyScratchOrg --source-dir force-app/main/default/classes

# 3. Retrieve metadata changes made in org Setup
sf project retrieve start --target-org MyScratchOrg

# Retrieve a specific metadata component
sf project retrieve start --target-org MyScratchOrg --metadata ApexClass:MyApexClass

# 4. Open org in browser
sf org open --target-org MyScratchOrg
```

### What Source Tracking Means

Source tracking keeps a local record of what changed between your local project and an org:

- It automatically detects additions, edits, and deletions.
- It detects conflicts before overwrite.
- **Support matrix**:
  - **Scratch orgs**: Supported and enabled by default.
  - **Developer & Developer Pro sandboxes**: Supported when enabled in Dev Hub Setup.
  - **Production, Developer Edition, Partial Copy, and Full sandboxes**: Source tracking is **not** supported (use direct or manifest deploys).

#### Turn Local Tracking On / Off

```bash
sf org enable tracking --target-org MyScratchOrg
sf org disable tracking --target-org MyScratchOrg
```

> **Key Point**: You can always deploy to an org that does not support source tracking. You simply lose automated local change/conflict detection.

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

## 8. Sandboxes (Modern CLI Approach)

Replaces legacy `sfdx force:org:create -t sandbox` and UI setups with modern `sf org` commands.

> [!WARNING]
> **Requires Paid Production Org with Sandbox Licenses**: Sandboxes cannot be created from a free Developer Edition org. Running `sf org create sandbox` against a Developer Edition account fails with **`Error (1): The requested resource does not exist`** because Developer Edition orgs lack the `SandboxInfo` Tooling API and sandbox licenses entirely. For Developer Edition accounts, use disposable **Scratch Orgs** (`sf org create scratch`).

```bash
# 1. Authorize production org that owns sandbox licenses
sf org login web --alias ProdOrg

# 2. Create a Developer Sandbox
sf org create sandbox \
  --name Dev1 \
  --license-type Developer \
  --target-org ProdOrg \
  --alias MyDevSandbox \
  --wait 30

# Or create via a Sandbox Definition File:
sf org create sandbox \
  --definition-file config/dev-sandbox-def.json \
  --target-org ProdOrg \
  --alias MyDevSandbox \
  --set-default --wait 30

# 3. Resume sandbox creation if queued (creation can exceed CLI wait time)
sf org resume sandbox --job-id <JOB_ID>

# 4. Open and inspect sandbox
sf org list
sf org display --target-org MyDevSandbox
sf org open --target-org MyDevSandbox

# 5. Clone an existing sandbox
sf org create sandbox \
  --name NewDev \
  --source-sandbox-name ExistingSandbox \
  --target-org ProdOrg \
  --alias NewDev \
  --set-default --wait 30

# 6. Refresh or delete a sandbox
sf org refresh sandbox --name Dev1 --target-org ProdOrg --wait 30
sf org delete sandbox --target-org MyDevSandbox --no-prompt
```

---

## 9. Testing, Debugging & Quality Gates

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

### 2. Backend Apex Unit Tests & Scratch-Org Users (Platform)

Requires an active scratch org or sandbox:

```bash
# Run local unit tests with code coverage
sf apex run test \
  --target-org MyScratchOrg \
  --test-level RunLocalTests \
  --code-coverage \
  --result-format human \
  --wait 5

# Run all tests in the org
sf apex run test --target-org MyScratchOrg --test-level RunAllTestsInOrg

# Create an additional scratch-org user (to test different profiles/permissions)
sf org create user --target-org MyScratchOrg --set-alias testuser1
```

### 3. Static Code Analysis (Salesforce Code Analyzer v5)

Replaces legacy manual Windows PMD 6.30 downloads and retired `sf scanner ...` workflows:

```bash
# Run Salesforce Code Analyzer v5 across all rules
sf code-analyzer run --workspace .
```

- **Configuration**: Use `code-analyzer.yml` (or `.yaml`) for rulesets and engine customizations. Code Analyzer v4 was officially retired in August 2025; v5 is the current standard.
- **What about old PMD XML rules?** Custom PMD rules are still supported, but configure them via `code-analyzer.yml` and invoke them with `sf code-analyzer rules` / `sf code-analyzer run`.
- **Java requirement**: Java (JDK 11+) is only required because Code Analyzer's underlying PMD engine runs on Java, not because Salesforce CLI itself requires Java.

### 4. Apex Replay Debugger Deep Dive

Apex Replay Debugger replays execution post-mortem from a recorded debug log. It is **free** and does not require the licensed, live Interactive Debugger.

#### Key Debugging Concepts

- **Debug Log**: The recorded sequence of Apex events generated when code executes. Replay Debugger navigates this log.
- **Line Breakpoint**: A pause point in code where you want to step through execution.
- **Checkpoint**: Captures a full snapshot of variable state and heap memory at a specific line (limit of 5 checkpoints at a time; expires after 30 minutes).
- **Trace Flag / Debug Level**: Directs Salesforce on which events to record and how verbosely.

#### Step-by-Step Workflow in VS Code

1. Open the project in VS Code with the _Salesforce Extension Pack_ and ensure the target org is authorized.
2. **Simple Unit Test Debugging**: Open the test class, set line breakpoints, open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`), and run:
   `SFDX: Launch Apex Replay Debugger with Current File` (or right-click editor -> choose command). This shortcut sets trace flags, generates a fresh log, and starts debugging automatically.
3. **Complex Triggers / Queueable Apex**:
   - Set breakpoints in your `.cls` or `.trigger` file.
   - For richer variable inspection, add up to 5 checkpoints and run `SFDX: Update Checkpoints in Org` from the Command Palette.
   - Run `SFDX: Turn On Apex Debug Log for Replay Debugger` to enable trace flags.
   - Reproduce the scenario in your org.
   - Open the resulting log in VS Code and launch Replay Debugger (or run `SFDX: Launch Apex Replay Debugger with Last Log File`).
4. **Step & Inspect**: Use Step Over, Step Into, and Continue to inspect the call stack, local variables, and heap dumps.

#### Why Checkpoints Matter

Ordinary log lines only print text strings. A checkpoint captures local/static variables and **trigger context variables** (e.g., `Trigger.new`, `Trigger.oldMap`) in a heap dump snapshot that is otherwise invisible in plain log text.

#### Troubleshooting Replay Debugger

| Problem                   | Cause / Solution                                                                                                                     |
| :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------- |
| **No log appears**        | Trace flag expired or configured for a different user. Ensure trace flag matches the active running user.                            |
| **Replay cannot start**   | Selected log is not an Apex log supported by Replay Debugger. Retrieve a fresh log.                                                  |
| **Variables missing**     | Set checkpoints **before** reproducing the issue, upload them to the org (`SFDX: Update Checkpoints in Org`), then trigger the code. |
| **Wrong code path**       | Local code does not match the code version deployed to the org that generated the log. Sync local files with org.                    |
| **Interactive vs Replay** | Replay Debugger replays recorded logs (free). Interactive Debugger pauses live threads (requires paid licenses).                     |

---

## 10. CLI Data Commands (Records vs Metadata)

Salesforce DX CLI includes dedicated commands for working with **Salesforce data (records)** as opposed to metadata:

### 1) Query Records with SOQL

```bash
# Basic SOQL query (human-readable table)
sf data query --target-org MyScratchOrg --query "SELECT Id, Name FROM Account LIMIT 10"

# Output to CSV or JSON file
sf data query --target-org MyScratchOrg \
  --query "SELECT Id, Name FROM Account LIMIT 100" \
  --result-format csv \
  --output-file accounts.csv

# For queries returning over 10,000 records, use bulk export:
sf data export bulk --target-org MyScratchOrg --query "SELECT Id, Name FROM Account"
```

### 2) Single-Record CRUD

```bash
# Create a record
sf data create record --target-org MyScratchOrg --sobject Account --values "Name='Acme Demo'"

# Get record by ID
sf data get record --target-org MyScratchOrg --sobject Account --record-id <RECORD_ID>

# Update a record
sf data update record --target-org MyScratchOrg --sobject Account --record-id <RECORD_ID> --values "Phone='555-0100'"

# Delete a record (destructive)
sf data delete record --target-org MyScratchOrg --sobject Account --record-id <RECORD_ID>
```

### 3) Export and Import Related Records as JSON (sObject Tree)

Used for small relational datasets (Accounts with Contacts, parent-child records up to 2,000 records):

```bash
# Export with plan file
sf data export tree --target-org MyScratchOrg \
  --query "SELECT Name, (SELECT FirstName, LastName, Email FROM Contacts) FROM Account LIMIT 5" \
  --output-dir ./data-export \
  --plan

# Import using generated plan file
sf data import tree --target-org MyScratchOrg --plan ./data-export/plan.json
```

### 4) CSV and Bulk API 2.0 (Larger Datasets)

```bash
# Bulk import from CSV
sf data import bulk --target-org MyScratchOrg --sobject Account --file ./accounts.csv --wait 10

# Bulk update (first column must contain Salesforce record ID)
sf data update bulk --target-org MyScratchOrg --sobject Account --file ./account-updates.csv --wait 10

# Bulk upsert (requires external ID field)
sf data upsert bulk --target-org MyScratchOrg \
  --sobject Account \
  --file ./accounts-upsert.csv \
  --external-id External_Account_ID__c \
  --wait 10

# Resume a queued bulk job if it takes longer than the wait period
sf data import resume --job-id <JOB_ID>
```

### 5) SOQL vs SOSL

- `sf data query`: Runs **SOQL** (structured SQL-like queries over known objects and fields).
- `sf data search`: Runs **SOSL** (text-based search across multiple searchable objects).

> 🔒 **Security Golden Rule**: Scratch orgs are disposable. Use synthetic or controlled mock data only. Never import sensitive production customer data into scratch orgs.

---

## 11. Local Jenkins Setup (Docker Compose)

The repository includes a ready-to-use Docker Compose configuration with a custom image containing:

- Jenkins LTS (JDK 17)
- Node.js 20 LTS & npm
- Salesforce CLI (`sf`) preinstalled globally
- `libatomic1` preinstalled (required for Node.js / V8 runtime)

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
- **Install Plugins**: Complete setup wizard and install **Git**, **Pipeline**, **Credentials Binding**, **JUnit**, and **NodeJS** plugins.

### Redeployment on a New Machine

Keep the following points in mind for a smooth redeployment on another computer:

#### 1. Build and Run via Docker Compose

Run Docker Compose directly from the repository root to ensure the custom image with `libatomic1`, Node.js, and `@salesforce/cli` is built:

```bash
docker compose up -d --build
```

> **Note**: Do not use the stock `jenkins/jenkins` base image directly without building from `docker/Dockerfile.jenkins`. Modern Salesforce CLI and Node.js require GCC atomic built-ins (`libatomic1`), which are baked into this repository's Dockerfile.

#### 2. Jenkins UI & Plugin Prerequisites

Because Jenkins data lives in a persistent Docker volume (`jenkins_home`), a fresh machine starts with an unconfigured Jenkins instance:

1. **Required Plugins**: **Git**, **Pipeline**, **Credentials Binding**, **JUnit**, and **NodeJS** plugins.
2. **NodeJS Tool Configuration**: The pipeline specifies `tools { nodejs 'NodeJS 26' }`. Navigate to **Manage Jenkins > Tools > NodeJS Installations** and configure an installation named `NodeJS 26` (with `@salesforce/cli` installed as a global npm package).

#### 3. Dev Hub Credentials & Secrets (Not Committed to Git)

For security, RSA keys and Connected App credentials are not stored in Git. On the new machine, configure these 3 credentials in **Manage Jenkins > Credentials**:

- `salesforce-jwt-key`: Secret file containing your private RSA key (`server.key`).
- `salesforce-connected-app-client-id`: Secret text containing the Connected App Consumer Key.
- `salesforce-devhub-username`: Secret text containing your Dev Hub admin username.

#### 4. GitHub Webhook Configuration (Automatic Triggers on Push)

To trigger the Jenkins pipeline automatically on `git push`:

1. **Expose Local Jenkins** (if running locally): GitHub needs a public URL. Tunnel port 8080 (e.g., `ngrok http 8080` or Cloudflare Tunnel).
2. **Enable Webhook in Jenkins**: In your Pipeline job configuration under **Build Triggers**, check **"GitHub hook trigger for GITScm polling"**.
3. **Add Webhook in GitHub**:
   - Go to your repository: **Settings > Webhooks > Add webhook**.
   - **Payload URL**: `https://<YOUR-JENKINS-HOST>/github-webhook/` _(the trailing slash is mandatory)_.
   - **Content type**: `application/json`.
   - **Which events**: Select **Just the push event**.
4. **Verify**: Test by pushing an empty commit (`git commit --allow-empty -m "ci: webhook test" && git push origin main`) and check that a new build starts under **Build History**.

---

## 12. CI/CD Pipelines: Jenkins & GitHub Actions

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
   Note: This might prompt to show auth URL for scratch org, in that case, use below:
   ```bash
   sf org auth show-sfdx-auth-url --target-org ProdOrg
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

## 13. End-to-End Lab & Modern Command Cheat Sheet

### Practice Lab: Do This Once From Start to Finish

Run this end-to-end flow once to verify your local setup:

```bash
# 1. Authorize Dev Hub
sf org login web --alias DevHub --set-default-dev-hub

# 2. Create scratch org
sf org create scratch \
  --target-dev-hub DevHub \
  --definition-file config/project-scratch-def.json \
  --alias LabOrg \
  --set-default

# 3. If creation is incomplete / times out
sf org resume scratch --use-most-recent

# 4. Inspect & open
sf org display --target-org LabOrg
sf org open --target-org LabOrg

# 5. Deploy local source metadata
sf project deploy start --target-org LabOrg

# 6. Run Apex tests
sf apex run test --target-org LabOrg --test-level RunLocalTests

# 7. Retrieve intended changes from org
sf project retrieve start --target-org LabOrg

# 8. Clean up & delete scratch org
sf org delete scratch --target-org LabOrg --no-prompt
```

### Modern Command Cheat Sheet (`sf` vs Legacy `sfdx`)

| Task                          | Legacy Command (`sfdx`)             | Modern Command (`sf`)                            |
| :---------------------------- | :---------------------------------- | :----------------------------------------------- |
| **Check Version**             | `sfdx --version`                    | `sf --version`                                   |
| **List Orgs**                 | `sfdx force:org:list`               | `sf org list` / `sf org list --all`              |
| **Browser Login**             | `sfdx auth:web:login`               | `sf org login web`                               |
| **JWT Headless Login**        | `sfdx auth:jwt:grant`               | `sf org login jwt`                               |
| **Auth URL Login**            | `sfdx auth:sfdxurl:store`           | `sf org login sfdx-url`                          |
| **Create Project**            | `sfdx force:project:create`         | `sf project generate --name <name>`              |
| **Create Scratch Org**        | `sfdx force:org:create`             | `sf org create scratch`                          |
| **Resume Scratch Creation**   | _(none/manual)_                     | `sf org resume scratch --job-id <id>`            |
| **Open Org**                  | `sfdx force:org:open`               | `sf org open --target-org <alias>`               |
| **Deploy Source**             | `sfdx force:source:push`            | `sf project deploy start`                        |
| **Retrieve Source**           | `sfdx force:source:pull`            | `sf project retrieve start`                      |
| **Preview Deploy / Retrieve** | _(none)_                            | `sf project deploy preview` / `retrieve preview` |
| **Run Apex Tests**            | `sfdx force:apex:test:run`          | `sf apex run test`                               |
| **Create Scratch User**       | `sfdx force:user:create`            | `sf org create user`                             |
| **Delete Scratch Org**        | `sfdx force:org:delete`             | `sf org delete scratch --no-prompt`              |
| **Create Sandbox**            | `sfdx force:org:create -t sandbox`  | `sf org create sandbox`                          |
| **Resume Sandbox**            | _(none/manual)_                     | `sf org resume sandbox`                          |
| **Static Analysis**           | Standalone PMD / `sfdx scanner:run` | `sf code-analyzer run`                           |
| **Query Records**             | `sfdx force:data:soql:query`        | `sf data query`                                  |
| **CRUD Records**              | `sfdx force:data:record:*`          | `sf data create/get/update/delete record`        |
| **Tree Export / Import**      | `sfdx force:data:tree:*`            | `sf data export/import tree`                     |
| **Bulk API 2.0 Data**         | `sfdx force:data:bulk:*`            | `sf data import/update/upsert bulk`              |

> 📌 **Key takeaway**: Ignore old `sfdx force:*`, `auth:web:login`, `force:auth:jwt:grant`, `force:source:push/pull`, standalone PMD 6.30, Jenkins click-through, and legacy `settings` blocks (e.g., `enableSetPasswordInApi` belongs in `"features"`, not `"settings"`). Use the modern `sf` workflow in this guide.
>
> **Official References**:
>
> - [Create Scratch Orgs](https://developer.salesforce.com/docs/platform/sfdx-dev/guide/sfdx-dev-scratch-orgs-create.html)
> - [Salesforce CLI Reference](https://developer.salesforce.com/docs/platform/salesforce-cli-reference)
> - [Salesforce Code Analyzer v5](https://developer.salesforce.com/docs/platform/salesforce-code-analyzer)
> - [Salesforce CLI Data Commands](https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_data.html)
