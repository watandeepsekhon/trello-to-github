#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { TrelloParser } from './parser.js';
import { InteractiveMapper } from './mapper.js';
import { TrelloImporter } from './importer.js';
import { ConfigManager } from './config.js';
import type { ImportConfig } from './types.js';

const program = new Command();

program
  .name('trello-to-github')
  .description('Migrate Trello boards to GitHub Projects')
  .version('0.1.0');

program
  .command('import')
  .description('Import a Trello board export to GitHub')
  .argument('<trello-file>', 'Path to Trello JSON export file')
  .requiredOption('-r, --repo <owner/repo>', 'GitHub repository (owner/repo)')
  .option('-p, --project <url>', 'GitHub Project URL (e.g. https://github.com/orgs/myorg/projects/1)')
  .option('--dry-run', 'Preview the import without making changes', false)
  .option('--resume', 'Resume from checkpoint (skip already imported cards)', false)
  .option('--only-epics', 'Only import epic cards', false)
  .action(async (trelloFile: string, options: any) => {
    try {
      console.log(chalk.bold.cyan('\n🎯 Trello to GitHub Importer\n'));

      // Parse Trello export
      console.log(chalk.gray(`Loading Trello export from: ${trelloFile}\n`));
      const parser = await TrelloParser.fromFile(trelloFile);

      // Show stats
      const stats = parser.getStats();
      console.log(chalk.bold('Board Statistics:'));
      console.log(`  • Lists: ${stats.totalLists}`);
      console.log(`  • Active Cards: ${stats.activeCards}`);
      console.log(`  • Archived Cards: ${stats.archivedCards} (will be skipped)`);
      console.log(`  • Labels: ${stats.totalLabels}`);
      console.log('');

      // Check for saved config
      const savedConfig = await ConfigManager.findConfig(trelloFile, options.repo);
      let listMappings;
      let epicStrategy;

      if (savedConfig) {
        console.log(chalk.cyan('💡 Found a saved configuration from ' + new Date(savedConfig.savedAt).toLocaleString() + '\n'));
        const useSaved = await InteractiveMapper.askToUseSavedConfig();

        if (useSaved) {
          listMappings = savedConfig.listMappings;
          epicStrategy = savedConfig.epicStrategy;
          console.log(chalk.gray('Using saved configuration\n'));
        }
      }

      // If no saved config or user declined, do interactive mapping
      if (!listMappings || !epicStrategy) {
        const lists = parser.getLists();
        listMappings = await InteractiveMapper.mapLists(lists);

        const hasEpics = listMappings.some(m => m.isEpic);
        epicStrategy = await InteractiveMapper.chooseEpicStrategy(hasEpics);
      }

      // Show summary and confirm
      const { confirmed, saveConfig } = await InteractiveMapper.confirmMappings(
        listMappings,
        epicStrategy
      );

      if (!confirmed) {
        console.log(chalk.yellow('\n⚠️  Import cancelled by user\n'));
        process.exit(0);
      }

      // Save config if requested
      if (saveConfig) {
        await ConfigManager.saveConfig({
          trelloFilePath: trelloFile,
          githubRepo: options.repo,
          githubProject: options.project,
          listMappings,
          epicStrategy,
        });
      }

      // Parse project URL if provided
      let projectOwner: string | undefined;
      let projectNumber: string | undefined;

      if (options.project) {
        const projectMatch = options.project.match(/github\.com\/(orgs|users)\/([^/]+)\/projects\/(\d+)/);
        if (projectMatch) {
          projectOwner = projectMatch[2];
          projectNumber = projectMatch[3];
        } else {
          throw new Error('Invalid project URL. Expected format: https://github.com/orgs/myorg/projects/1');
        }
      }

      // Create import config
      const config: ImportConfig = {
        trelloFilePath: trelloFile,
        githubRepo: options.repo,
        githubProject: projectNumber,
        projectOwner,
        listMappings,
        epicStrategy,
        dryRun: options.dryRun,
        resume: options.resume,
        onlyEpics: options.onlyEpics,
      };

      // Run import
      const importer = new TrelloImporter(parser, config);
      const result = await importer.import();

      // Exit with success
      if (result.errors.length === 0) {
        console.log(chalk.bold.green('✅ Import completed successfully!\n'));
        process.exit(0);
      } else {
        console.log(
          chalk.bold.yellow('⚠️  Import completed with some errors\n')
        );
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.bold.red(`\n❌ Error: ${error.message}\n`));
      if (error.stack && process.env.DEBUG) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show statistics about a Trello board export')
  .argument('<trello-file>', 'Path to Trello JSON export file')
  .action(async (trelloFile: string) => {
    try {
      const parser = await TrelloParser.fromFile(trelloFile);
      const board = parser.getBoard();
      const stats = parser.getStats();

      console.log(chalk.bold.cyan(`\n📊 Trello Board: ${board.name}\n`));

      console.log(chalk.bold('Lists:'));
      const lists = parser.getLists();
      lists.forEach(list => {
        const cardCount = parser.getCardsByList(list.id).length;
        console.log(`  • ${list.name} (${cardCount} cards)`);
      });

      console.log(chalk.bold('\nStatistics:'));
      console.log(`  • Total Cards: ${stats.totalCards}`);
      console.log(`  • Active Cards: ${stats.activeCards}`);
      console.log(`  • Archived Cards: ${stats.archivedCards}`);
      console.log(`  • Labels: ${stats.totalLabels}`);
      console.log(`  • Members: ${stats.totalMembers}`);

      if (board.labels && board.labels.length > 0) {
        console.log(chalk.bold('\nLabels:'));
        board.labels
          .filter(l => l.name)
          .forEach(label => {
            console.log(`  • ${label.name} (${label.color || 'no color'})`);
          });
      }

      console.log('');
    } catch (error: any) {
      console.error(chalk.bold.red(`\n❌ Error: ${error.message}\n`));
      process.exit(1);
    }
  });

program.parse();
