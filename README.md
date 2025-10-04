# trello-to-github

A CLI tool to migrate Trello boards to GitHub Projects with full control over column mapping and epic handling.

## Features

- 🎯 **Interactive Column Mapping** - Choose which Trello lists map to GitHub Project columns
- 🏷️ **Epic Support** - Handle epic lists as custom fields or parent/child issues
- 💬 **Comment Preservation** - Import all Trello card comments with original timestamps and authors
- ✅ **Checklist Migration** - Convert Trello checklists to GitHub task lists
- 🏷️ **Label Preservation** - Maintain Trello labels with color matching
- 🔍 **Dry Run Mode** - Preview changes before applying them
- 📊 **Detailed Statistics** - View board stats and structure before importing
- 🗺️ **Mapping File** - Generate JSON mapping between Trello cards and GitHub issues
- 💾 **Config Saving** - Save your configuration and reuse it if the import fails

## Prerequisites

- **Node.js** 18+
- **GitHub CLI** (`gh`) - [Install instructions](https://cli.github.com/)
  ```bash
  # macOS
  brew install gh

  # Authenticate
  gh auth login
  ```

## Installation

### Via npx (Recommended)

```bash
npx trello-to-github import <trello-export.json> --repo owner/repo
```

### Global Installation

```bash
npm install -g trello-to-github
trello-to-github import <trello-export.json> --repo owner/repo
```

### From Source

```bash
git clone https://github.com/yourusername/trello-to-github.git
cd trello-to-github
npm install
npm run build
npm link
```

## Usage

### 1. Export Your Trello Board

1. Open your Trello board
2. Click **Show Menu** → **More** → **Print and Export**
3. Choose **Export as JSON**
4. Save the file locally

### 2. View Board Statistics (Optional)

Get an overview of your Trello board before importing:

```bash
trello-to-github stats your-export.json
```

This shows:
- All lists and card counts
- Active vs archived cards
- Labels
- Members

### 3. Import to GitHub

#### Basic Import

```bash
trello-to-github import your-export.json --repo owner/repo
```

#### With GitHub Project

```bash
trello-to-github import your-export.json \
  --repo owner/repo \
  --project https://github.com/orgs/myorg/projects/1
```

Or for user-owned projects:

```bash
trello-to-github import your-export.json \
  --repo owner/repo \
  --project https://github.com/users/myusername/projects/1
```

#### Dry Run (Preview Only)

```bash
trello-to-github import your-export.json \
  --repo owner/repo \
  --dry-run
```

### 4. Interactive Configuration

The tool will guide you through mapping your Trello lists:

```
📋 Column Mapping Configuration

For each Trello list, you can:
  - Map it to a GitHub Project status column
  - Mark it as an Epic (grouping mechanism)
  - Skip it (cards in skipped lists won't be imported)

? What should we do with list "Backlog"?
  ❯ Map to GitHub column
    Treat as Epic container
    Skip this list
```

### 5. Epic Handling

If you mark lists as Epics, choose how to represent them:

- **Custom Field** - Adds an "Epic" field to your GitHub Project
- **Parent/Child Issues** - Creates parent issues with task lists linking to child issues

### 6. Configuration Saving

After you confirm your mappings, you'll be asked if you want to save the configuration:

```
? Save this configuration for future imports? (Y/n)
```

If you save it, the next time you run the same import (same Trello file + GitHub repo), you'll be prompted to reuse the saved configuration. This is especially useful if:
- The import fails and you need to retry
- You're testing with `--dry-run` first
- You want to re-import the same board structure

Saved configs are stored in `~/.trello-to-github/configs.json`

## What Gets Imported

✅ **Imported:**
- Active (non-archived) cards
- Card titles and descriptions
- Checklists (as GitHub task lists)
- Labels (with color matching)
- Comments (with author and timestamp preserved)
- Card position in lists (mapped to GitHub Project columns)

❌ **Not Imported:**
- Archived cards
- Cards in "Complete" lists (configurable via mapping)
- Attachments
- Card cover images
- Trello-specific power-ups

## Examples

### Example: Simple Migration

```bash
# Export from Trello, then:
trello-to-github import trello-export.json --repo myorg/myrepo

# During interactive setup:
# - Map "To Do" → "Todo"
# - Map "In Progress" → "In Progress"
# - Map "Done" → Skip (don't import completed items)
# - Skip any epic/category lists
```

### Example: With Epics

```bash
trello-to-github import trello-export.json \
  --repo myorg/myrepo \
  --project https://github.com/orgs/myorg/projects/2

# During interactive setup:
# - Mark "Epic: Authentication" as Epic container
# - Mark "Epic: Dashboard" as Epic container
# - Choose "Parent/Child Issues" for epic strategy
# - Map regular workflow lists (Backlog, In Progress, etc.)
```

### Example: Dry Run First

```bash
# Preview what will happen
trello-to-github import trello-export.json \
  --repo myorg/myrepo \
  --dry-run

# If satisfied, run for real
trello-to-github import trello-export.json \
  --repo myorg/myrepo
```

## Output Files

After a successful import, the tool creates:

- **trello-github-mapping.json** - Maps Trello card IDs to GitHub issue numbers
  ```json
  {
    "trello-card-id-123": "42",
    "trello-card-id-456": "43"
  }
  ```

## Troubleshooting

### GitHub CLI Not Authenticated

```
Error: GitHub CLI is not authenticated
```

**Solution:** Run `gh auth login` and follow the prompts.

### Rate Limiting

The tool includes automatic delays between API calls to avoid rate limiting. For very large boards (100+ cards), expect the import to take several minutes.

### Project Issues

**Using an existing project:**
- Provide the full project URL: `--project https://github.com/orgs/myorg/projects/1`
- The project can be owned by a different org/user than the repository
- You need access to the project to add issues to it

**Creating a new project:**
- Currently not supported - projects must be created manually first
- Create your project on GitHub, then provide its URL to the tool

### Label Colors Not Matching

Trello and GitHub use different color systems. The tool maps common colors but some custom colors may default to gray.

## Development

### Setup

```bash
git clone https://github.com/yourusername/trello-to-github.git
cd trello-to-github
npm install
```

### Build

```bash
npm run build
```

### Run Locally

```bash
npm start -- import <file> --repo owner/repo
```

**Note:** The `--` after `npm start` is required to pass arguments to the script.

### Watch Mode

```bash
npm run dev
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT

## Credits

Built with:
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) - Interactive prompts
- [Chalk](https://github.com/chalk/chalk) - Terminal styling
- [Zod](https://github.com/colinhacks/zod) - Schema validation
- [Execa](https://github.com/sindresorhus/execa) - Process execution
