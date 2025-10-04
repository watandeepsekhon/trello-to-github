import { execa } from 'execa';
import type { TrelloComment, TrelloLabel } from './types.js';

export interface GitHubIssue {
  number: number;
  url: string;
  title: string;
}

export class GitHubClient {
  private repo: string;

  constructor(repo: string) {
    this.repo = repo;
  }

  /**
   * Check if GitHub CLI is installed and authenticated
   */
  async checkAuth(): Promise<boolean> {
    try {
      await execa('gh', ['auth', 'status']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a GitHub issue
   */
  async createIssue(options: {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
  }): Promise<GitHubIssue> {
    const args = [
      'issue',
      'create',
      '--repo',
      this.repo,
      '--title',
      options.title,
      '--body',
      options.body,
      '--json',
      'number,url,title',
    ];

    if (options.labels && options.labels.length > 0) {
      args.push('--label', options.labels.join(','));
    }

    if (options.assignees && options.assignees.length > 0) {
      args.push('--assignee', options.assignees.join(','));
    }

    const { stdout } = await execa('gh', args);
    const result = JSON.parse(stdout);

    return {
      number: result.number,
      url: result.url,
      title: result.title,
    };
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueNumber: number, body: string): Promise<void> {
    await execa('gh', [
      'issue',
      'comment',
      issueNumber.toString(),
      '--repo',
      this.repo,
      '--body',
      body,
    ]);
  }

  /**
   * Create a label if it doesn't exist
   */
  async createLabel(name: string, color?: string): Promise<void> {
    try {
      const args = ['label', 'create', name, '--repo', this.repo];

      if (color) {
        // Remove # if present
        const cleanColor = color.replace('#', '');
        args.push('--color', cleanColor);
      }

      await execa('gh', args);
    } catch (error: any) {
      // Ignore if label already exists
      if (!error.message?.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Get or create a GitHub Project (v2)
   */
  async getOrCreateProject(projectName: string): Promise<string> {
    try {
      // List projects and find matching one
      const { stdout } = await execa('gh', [
        'project',
        'list',
        '--owner',
        this.repo.split('/')[0],
        '--format',
        'json',
      ]);

      const projects = JSON.parse(stdout);
      const existing = projects.projects?.find(
        (p: any) => p.title === projectName
      );

      if (existing) {
        return existing.number.toString();
      }

      // Create new project
      const { stdout: createOutput } = await execa('gh', [
        'project',
        'create',
        '--owner',
        this.repo.split('/')[0],
        '--title',
        projectName,
        '--format',
        'json',
      ]);

      const newProject = JSON.parse(createOutput);
      return newProject.number.toString();
    } catch (error) {
      throw new Error(`Failed to get or create project: ${error}`);
    }
  }

  /**
   * Add an issue to a project
   */
  async addIssueToProject(
    projectNumber: string,
    issueUrl: string
  ): Promise<void> {
    await execa('gh', [
      'project',
      'item-add',
      projectNumber,
      '--owner',
      this.repo.split('/')[0],
      '--url',
      issueUrl,
    ]);
  }

  /**
   * Set the status of an item in a project
   */
  async setProjectItemStatus(
    projectNumber: string,
    issueUrl: string,
    status: string
  ): Promise<void> {
    try {
      await execa('gh', [
        'project',
        'item-edit',
        '--project-number',
        projectNumber,
        '--owner',
        this.repo.split('/')[0],
        '--url',
        issueUrl,
        '--field-name',
        'Status',
        '--field-value',
        status,
      ]);
    } catch (error) {
      // Non-fatal: status field might not exist yet
      console.warn(`Could not set status to "${status}": ${error}`);
    }
  }

  /**
   * Format Trello comments for GitHub
   */
  formatCommentsForGitHub(comments: TrelloComment[]): string[] {
    return comments.map(comment => {
      const date = new Date(comment.date).toLocaleString();
      return `**${comment.author}** commented on ${date}:\n\n${comment.text}`;
    });
  }

  /**
   * Map Trello label colors to GitHub label colors
   */
  mapLabelColor(trelloColor?: string): string {
    const colorMap: Record<string, string> = {
      green: '0E8A16',
      yellow: 'FEF2C0',
      orange: 'D93F0B',
      red: 'B60205',
      purple: '5319E7',
      blue: '0052CC',
      sky: '00B8D9',
      lime: '61BD4F',
      pink: 'FF78CB',
      black: '344563',
    };

    return colorMap[trelloColor ?? ''] ?? 'CCCCCC';
  }

  /**
   * Ensure all Trello labels exist in GitHub
   */
  async ensureLabelsExist(labels: TrelloLabel[]): Promise<void> {
    for (const label of labels) {
      if (label.name) {
        const color = this.mapLabelColor(label.color);
        await this.createLabel(label.name, color);
      }
    }
  }
}
