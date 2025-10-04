import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import type { ListMapping, EpicStrategy } from './types.js';

export interface SavedConfig {
  listMappings: ListMapping[];
  epicStrategy: EpicStrategy;
  githubRepo: string;
  githubProject?: string;
  trelloFileName: string;
  savedAt: string;
}

export class ConfigManager {
  private static configDir = join(homedir(), '.trello-to-github');
  private static configFile = join(ConfigManager.configDir, 'configs.json');

  /**
   * Save a configuration for future use
   */
  static async saveConfig(
    config: {
      trelloFilePath: string;
      githubRepo: string;
      githubProject?: string;
      listMappings: ListMapping[];
      epicStrategy: EpicStrategy;
    }
  ): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Extract filename from path
      const trelloFileName = config.trelloFilePath.split('/').pop() || config.trelloFilePath;

      // Load existing configs
      const configs = await this.loadAllConfigs();

      // Create new config entry
      const savedConfig: SavedConfig = {
        listMappings: config.listMappings,
        epicStrategy: config.epicStrategy,
        githubRepo: config.githubRepo,
        githubProject: config.githubProject,
        trelloFileName,
        savedAt: new Date().toISOString(),
      };

      // Add or update config (keyed by trello filename + repo)
      const configKey = `${trelloFileName}:${config.githubRepo}`;
      configs[configKey] = savedConfig;

      // Save back to file
      await fs.writeFile(
        this.configFile,
        JSON.stringify(configs, null, 2),
        'utf-8'
      );

      console.log(chalk.gray(`💾 Configuration saved for future use\n`));
    } catch (error: any) {
      console.error(chalk.yellow(`Warning: Could not save config: ${error.message}`));
    }
  }

  /**
   * Find a saved config matching the current import parameters
   */
  static async findConfig(
    trelloFilePath: string,
    githubRepo: string
  ): Promise<SavedConfig | null> {
    try {
      const trelloFileName = trelloFilePath.split('/').pop() || trelloFilePath;
      const configKey = `${trelloFileName}:${githubRepo}`;

      const configs = await this.loadAllConfigs();
      return configs[configKey] || null;
    } catch {
      return null;
    }
  }

  /**
   * Load all configs from file
   */
  private static async loadAllConfigs(): Promise<Record<string, SavedConfig>> {
    try {
      const data = await fs.readFile(this.configFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
}
