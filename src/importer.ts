import chalk from 'chalk';
import { writeFile } from 'fs/promises';
import { TrelloParser } from './parser.js';
import { GitHubClient } from './github-client.js';
import type { ImportConfig, ImportResult, ListMapping, TrelloCard } from './types.js';

export class TrelloImporter {
  private parser: TrelloParser;
  private github: GitHubClient;
  private config: ImportConfig;

  constructor(parser: TrelloParser, config: ImportConfig) {
    this.parser = parser;
    this.github = new GitHubClient(config.githubRepo);
    this.config = config;
  }

  /**
   * Run the import process
   */
  async import(): Promise<ImportResult> {
    const result: ImportResult = {
      cardsImported: 0,
      cardsSkipped: 0,
      issuesCreated: [],
      mapping: {},
      errors: [],
    };

    console.log(chalk.bold('\n🚀 Starting Trello to GitHub Import\n'));

    // Check GitHub CLI authentication
    const isAuthenticated = await this.github.checkAuth();
    if (!isAuthenticated) {
      throw new Error(
        'GitHub CLI is not authenticated. Please run: gh auth login'
      );
    }

    console.log(chalk.green('✓ GitHub CLI authenticated\n'));

    // Get all labels and ensure they exist in GitHub
    const board = this.parser.getBoard();
    if (board.labels && board.labels.length > 0 && !this.config.dryRun) {
      console.log(chalk.cyan('Creating labels in GitHub...'));
      await this.github.ensureLabelsExist(board.labels);
      console.log(chalk.green(`✓ Created ${board.labels.length} labels\n`));
    }

    // Get or create project if specified
    let projectNumber: string | undefined;
    if (this.config.githubProject && !this.config.dryRun) {
      console.log(chalk.cyan('Setting up GitHub Project...'));
      projectNumber = await this.github.getOrCreateProject(
        this.config.githubProject
      );
      console.log(chalk.green(`✓ Project ready: #${projectNumber}\n`));
    }

    // Process regular (non-epic) cards
    const regularMappings = this.config.listMappings.filter(
      m => m.githubColumn && !m.isEpic
    );

    for (const mapping of regularMappings) {
      await this.processListCards(mapping, projectNumber, result);
    }

    // Process epic cards
    const epicMappings = this.config.listMappings.filter(m => m.isEpic);
    if (epicMappings.length > 0) {
      await this.processEpicCards(epicMappings, projectNumber, result);
    }

    // Save mapping file
    if (!this.config.dryRun && Object.keys(result.mapping).length > 0) {
      const mappingFile = 'trello-github-mapping.json';
      await writeFile(mappingFile, JSON.stringify(result.mapping, null, 2));
      console.log(chalk.gray(`\n📄 Mapping saved to ${mappingFile}`));
    }

    // Print summary
    this.printSummary(result);

    return result;
  }

  /**
   * Process cards from a regular list
   */
  private async processListCards(
    mapping: ListMapping,
    projectNumber: string | undefined,
    result: ImportResult
  ): Promise<void> {
    const cards = this.parser.getCardsByList(mapping.trelloListId);

    if (cards.length === 0) {
      console.log(
        chalk.gray(`No cards in "${mapping.trelloListName}", skipping...`)
      );
      return;
    }

    console.log(
      chalk.bold(
        `\n📌 Processing "${mapping.trelloListName}" → "${mapping.githubColumn}"`
      )
    );
    console.log(chalk.gray(`   ${cards.length} card(s) to import\n`));

    for (const card of cards) {
      try {
        await this.importCard(card, mapping.githubColumn!, projectNumber, result);
      } catch (error: any) {
        const errorMsg = `Failed to import "${card.name}": ${error.message}`;
        result.errors.push(errorMsg);
        console.log(chalk.red(`   ✗ ${errorMsg}`));
      }
    }
  }

  /**
   * Process epic cards
   */
  private async processEpicCards(
    epicMappings: ListMapping[],
    projectNumber: string | undefined,
    result: ImportResult
  ): Promise<void> {
    console.log(chalk.bold('\n🏷️  Processing Epic Cards\n'));

    for (const epicMapping of epicMappings) {
      const cards = this.parser.getCardsByList(epicMapping.trelloListId);

      if (cards.length === 0) {
        continue;
      }

      console.log(
        chalk.cyan(`Epic: "${epicMapping.trelloListName}" (${cards.length} cards)`)
      );

      if (this.config.epicStrategy.type === 'parent-child') {
        // Create a parent issue for this epic
        await this.createEpicParentIssue(
          epicMapping,
          cards,
          projectNumber,
          result
        );
      } else {
        // Import as regular issues with epic field
        for (const card of cards) {
          try {
            await this.importCard(
              card,
              'Backlog', // Default status for epics
              projectNumber,
              result,
              epicMapping.trelloListName // Epic name
            );
          } catch (error: any) {
            const errorMsg = `Failed to import epic card "${card.name}": ${error.message}`;
            result.errors.push(errorMsg);
            console.log(chalk.red(`   ✗ ${errorMsg}`));
          }
        }
      }
    }
  }

  /**
   * Create a parent issue for an epic with child task list
   */
  private async createEpicParentIssue(
    epicMapping: ListMapping,
    cards: TrelloCard[],
    projectNumber: string | undefined,
    result: ImportResult
  ): Promise<void> {
    const taskList = cards
      .map(card => `- [ ] ${card.name}`)
      .join('\n');

    const body = `Epic containing ${cards.length} related issues.\n\n## Tasks\n\n${taskList}`;

    if (this.config.dryRun) {
      console.log(chalk.gray(`   [DRY RUN] Would create epic: "${epicMapping.trelloListName}"`));
      result.cardsSkipped += cards.length;
      return;
    }

    const issue = await this.github.createIssue({
      title: `Epic: ${epicMapping.trelloListName}`,
      body,
      labels: ['epic'],
    });

    console.log(chalk.green(`   ✓ Created epic issue: ${issue.url}`));

    result.cardsImported++;
    result.issuesCreated.push(issue.url);

    // Add to project if specified
    if (projectNumber) {
      await this.github.addIssueToProject(projectNumber, issue.url);
    }

    // Now create child issues and link them
    for (const card of cards) {
      try {
        const childIssue = await this.importCard(
          card,
          'Backlog',
          projectNumber,
          result,
          undefined,
          issue.number
        );
      } catch (error: any) {
        result.errors.push(`Failed to import child card "${card.name}": ${error.message}`);
      }
    }
  }

  /**
   * Import a single card as a GitHub issue
   */
  private async importCard(
    card: TrelloCard,
    status: string,
    projectNumber: string | undefined,
    result: ImportResult,
    epicName?: string,
    parentIssue?: number
  ): Promise<void> {
    // Format description
    let body = this.parser.formatCardDescription(card);

    // Add epic reference if applicable
    if (epicName && this.config.epicStrategy.type === 'custom-field') {
      body = `**Epic:** ${epicName}\n\n${body}`;
    }

    // Add parent issue reference if applicable
    if (parentIssue) {
      body = `Part of #${parentIssue}\n\n${body}`;
    }

    // Get labels
    const labels = this.parser.getCardLabels(card).map(l => l.name).filter(Boolean);

    if (this.config.dryRun) {
      console.log(chalk.gray(`   [DRY RUN] Would create: "${card.name}"`));
      result.cardsSkipped++;
      return;
    }

    // Create issue
    const issue = await this.github.createIssue({
      title: card.name,
      body,
      labels,
    });

    console.log(chalk.green(`   ✓ Created: "${card.name}" → ${issue.url}`));

    result.cardsImported++;
    result.issuesCreated.push(issue.url);
    result.mapping[card.id] = issue.number.toString();

    // Add to project if specified
    if (projectNumber) {
      await this.github.addIssueToProject(projectNumber, issue.url);
      await this.github.setProjectItemStatus(projectNumber, issue.url, status);
    }

    // Import comments
    const comments = this.parser.getCardComments(card);
    if (comments.length > 0) {
      console.log(chalk.gray(`      Adding ${comments.length} comment(s)...`));

      const formattedComments = this.github.formatCommentsForGitHub(comments);
      for (const commentBody of formattedComments) {
        await this.github.addComment(issue.number, commentBody);
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * Print import summary
   */
  private printSummary(result: ImportResult): void {
    console.log(chalk.bold('\n\n' + '='.repeat(60)));
    console.log(chalk.bold('📊 Import Summary'));
    console.log(chalk.bold('='.repeat(60) + '\n'));

    if (this.config.dryRun) {
      console.log(chalk.yellow('🔍 DRY RUN MODE - No changes were made\n'));
    }

    console.log(chalk.green(`✓ Cards imported: ${result.cardsImported}`));
    console.log(chalk.gray(`⏭️  Cards skipped: ${result.cardsSkipped}`));

    if (result.errors.length > 0) {
      console.log(chalk.red(`✗ Errors: ${result.errors.length}`));
      console.log(chalk.red('\nErrors:'));
      result.errors.forEach(err => console.log(chalk.red(`  • ${err}`)));
    }

    console.log('');
  }
}
