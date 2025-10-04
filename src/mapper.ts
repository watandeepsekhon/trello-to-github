import inquirer from 'inquirer';
import type { TrelloList, ListMapping, EpicStrategy } from './types.js';

export class InteractiveMapper {
  /**
   * Prompt user to map Trello lists to GitHub Project columns
   */
  static async mapLists(lists: TrelloList[]): Promise<ListMapping[]> {
    console.log('\n📋 Column Mapping Configuration\n');
    console.log('For each Trello list, you can:');
    console.log('  - Map it to a GitHub Project status column');
    console.log('  - Mark it as an Epic (grouping mechanism)');
    console.log('  - Skip it (cards in skipped lists won\'t be imported)\n');

    const mappings: ListMapping[] = [];

    for (const list of lists) {
      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: 'list',
          name: 'action',
          message: `What should we do with list "${list.name}"?`,
          choices: [
            { name: 'Map to GitHub column', value: 'map' },
            { name: 'Treat as Epic container', value: 'epic' },
            { name: 'Skip this list', value: 'skip' },
          ],
        },
      ]);

      if (action === 'skip') {
        mappings.push({
          trelloListId: list.id,
          trelloListName: list.name,
          githubColumn: null,
          isEpic: false,
        });
        console.log(`   ⏭️  Skipping "${list.name}"\n`);
        continue;
      }

      if (action === 'epic') {
        mappings.push({
          trelloListId: list.id,
          trelloListName: list.name,
          githubColumn: null,
          isEpic: true,
        });
        console.log(`   🏷️  Marking "${list.name}" as Epic\n`);
        continue;
      }

      // Map to column
      const { columnName } = await inquirer.prompt<{ columnName: string }>([
        {
          type: 'input',
          name: 'columnName',
          message: `  GitHub column name for "${list.name}":`,
          default: list.name,
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return 'Column name cannot be empty';
            }
            return true;
          },
        },
      ]);

      mappings.push({
        trelloListId: list.id,
        trelloListName: list.name,
        githubColumn: columnName.trim(),
        isEpic: false,
      });
      console.log(`   ✓ Mapped to "${columnName}"\n`);
    }

    return mappings;
  }

  /**
   * Prompt user to choose epic handling strategy
   */
  static async chooseEpicStrategy(hasEpics: boolean): Promise<EpicStrategy> {
    if (!hasEpics) {
      return { type: 'custom-field' };
    }

    console.log('\n🏷️  Epic Handling Strategy\n');
    console.log('You marked some lists as Epics. How should we handle them?\n');

    const { strategy } = await inquirer.prompt<{ strategy: 'custom-field' | 'parent-child' }>([
      {
        type: 'list',
        name: 'strategy',
        message: 'How should Epics be represented in GitHub?',
        choices: [
          {
            name: 'Custom Field - Add "Epic" field to GitHub Project',
            value: 'custom-field',
          },
          {
            name: 'Parent/Child Issues - Create parent issues with task lists',
            value: 'parent-child',
          },
        ],
      },
    ]);

    if (strategy === 'custom-field') {
      const { fieldName } = await inquirer.prompt<{ fieldName: string }>([
        {
          type: 'input',
          name: 'fieldName',
          message: 'Name of the custom field:',
          default: 'Epic',
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return 'Field name cannot be empty';
            }
            return true;
          },
        },
      ]);

      return {
        type: 'custom-field',
        customFieldName: fieldName.trim(),
      };
    }

    return { type: 'parent-child' };
  }

  /**
   * Show confirmation summary and ask for approval
   */
  static async confirmMappings(
    mappings: ListMapping[],
    epicStrategy: EpicStrategy
  ): Promise<boolean> {
    console.log('\n📊 Import Summary\n');

    const mapped = mappings.filter(m => m.githubColumn);
    const epics = mappings.filter(m => m.isEpic);
    const skipped = mappings.filter(m => !m.githubColumn && !m.isEpic);

    if (mapped.length > 0) {
      console.log('Lists to import:');
      for (const m of mapped) {
        console.log(`  • "${m.trelloListName}" → "${m.githubColumn}"`);
      }
      console.log('');
    }

    if (epics.length > 0) {
      console.log('Epic lists:');
      for (const e of epics) {
        console.log(`  • "${e.trelloListName}" (${epicStrategy.type})`);
      }
      console.log('');
    }

    if (skipped.length > 0) {
      console.log('Lists to skip:');
      for (const s of skipped) {
        console.log(`  • "${s.trelloListName}"`);
      }
      console.log('');
    }

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with this configuration?',
        default: true,
      },
    ]);

    return confirm;
  }

  /**
   * Ask if user wants to save configuration
   */
  static async askToSaveConfig(): Promise<boolean> {
    const { save } = await inquirer.prompt<{ save: boolean }>([
      {
        type: 'confirm',
        name: 'save',
        message: 'Save this configuration for future imports?',
        default: false,
      },
    ]);

    return save;
  }
}
