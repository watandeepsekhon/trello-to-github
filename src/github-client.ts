import { execa } from 'execa';
import type { TrelloComment, TrelloLabel } from './types.js';

export interface GitHubIssue {
  number: number;
  url: string;
  title: string;
}

export class GitHubClient {
  private repo: string;
  private projectOwner?: string;
  private projectId?: string;
  private statusFieldId?: string;
  private statusFieldOptions?: Map<string, string>; // status name -> option ID

  constructor(repo: string, projectOwner?: string) {
    this.repo = repo;
    this.projectOwner = projectOwner;
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
    ];

    if (options.labels && options.labels.length > 0) {
      args.push('--label', options.labels.join(','));
    }

    if (options.assignees && options.assignees.length > 0) {
      args.push('--assignee', options.assignees.join(','));
    }

    const { stdout } = await execa('gh', args);

    // Parse the output URL from the response
    // gh issue create returns a URL like: https://github.com/owner/repo/issues/123
    const urlMatch = stdout.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/(\d+)/);
    if (!urlMatch) {
      throw new Error(`Failed to parse issue URL from gh output: ${stdout}`);
    }

    const url = urlMatch[0];
    const number = parseInt(urlMatch[1], 10);

    return {
      number,
      url,
      title: options.title,
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
  async getOrCreateProject(projectNumber: string, projectOwner?: string): Promise<string> {
    // Fetch project metadata including field information
    await this.initializeProjectMetadata(projectNumber, projectOwner);
    return projectNumber;
  }

  /**
   * Initialize project metadata (ID, field IDs, status options)
   */
  private async initializeProjectMetadata(projectNumber: string, projectOwner?: string): Promise<void> {
    const owner = projectOwner || this.repo.split('/')[0];

    const query = `
      query($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) {
            id
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const { stdout } = await execa('gh', [
        'api', 'graphql',
        '-f', `query=${query}`,
        '-F', `owner=${owner}`,
        '-F', `number=${projectNumber}`
      ]);

      const response = JSON.parse(stdout);
      const project = response.data?.organization?.projectV2;

      if (!project) {
        // Try as user project instead of org
        const userQuery = query.replace('organization', 'user');
        const { stdout: userStdout } = await execa('gh', [
          'api', 'graphql',
          '-f', `query=${userQuery}`,
          '-F', `owner=${owner}`,
          '-F', `number=${projectNumber}`
        ]);
        const userResponse = JSON.parse(userStdout);
        const userProject = userResponse.data?.user?.projectV2;

        if (userProject) {
          this.projectId = userProject.id;
          this.parseProjectFields(userProject.fields.nodes);
        }
      } else {
        this.projectId = project.id;
        this.parseProjectFields(project.fields.nodes);
      }
    } catch (error) {
      console.warn('Could not fetch project metadata for automatic status setting');
    }
  }

  /**
   * Parse project fields to find Status field and its options
   */
  private parseProjectFields(fields: any[]): void {
    for (const field of fields) {
      if (field.name === 'Status' && field.options) {
        this.statusFieldId = field.id;
        this.statusFieldOptions = new Map(
          field.options.map((opt: any) => [opt.name, opt.id])
        );
        break;
      }
    }
  }

  /**
   * Add an issue to a project and return the project item ID
   */
  async addIssueToProject(
    projectNumber: string,
    issueUrl: string
  ): Promise<string | null> {
    const owner = this.projectOwner || this.repo.split('/')[0];

    try {
      const { stdout } = await execa('gh', [
        'project',
        'item-add',
        projectNumber,
        '--owner',
        owner,
        '--url',
        issueUrl,
        '--format',
        'json'
      ]);

      const response = JSON.parse(stdout);
      return response.id || null;
    } catch (error) {
      // Fallback: try without --format json for older gh versions
      await execa('gh', [
        'project',
        'item-add',
        projectNumber,
        '--owner',
        owner,
        '--url',
        issueUrl,
      ]);
      return null;
    }
  }

  /**
   * Set the status of an item in a project
   */
  async setProjectItemStatus(
    projectNumber: string,
    issueUrl: string,
    status: string,
    itemId?: string | null
  ): Promise<void> {
    // Check if we have all the required metadata
    if (!this.projectId || !this.statusFieldId || !this.statusFieldOptions) {
      return; // Can't set status without metadata
    }

    // Get the status option ID
    const statusOptionId = this.statusFieldOptions.get(status);
    if (!statusOptionId) {
      console.warn(`Status "${status}" not found in project. Available: ${Array.from(this.statusFieldOptions.keys()).join(', ')}`);
      return;
    }

    // If we don't have the item ID, we need to fetch it
    if (!itemId) {
      itemId = await this.getProjectItemId(issueUrl);
      if (!itemId) {
        console.warn(`Could not find project item ID for ${issueUrl}`);
        return;
      }
    }

    // Update the status using GraphQL
    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: {
            singleSelectOptionId: $optionId
          }
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;

    try {
      await execa('gh', [
        'api', 'graphql',
        '-f', `query=${mutation}`,
        '-F', `projectId=${this.projectId}`,
        '-F', `itemId=${itemId}`,
        '-F', `fieldId=${this.statusFieldId}`,
        '-F', `optionId=${statusOptionId}`
      ]);
    } catch (error) {
      console.warn(`Could not set status to "${status}": ${error}`);
    }
  }

  /**
   * Get the project item ID for an issue URL
   */
  private async getProjectItemId(issueUrl: string): Promise<string | null> {
    if (!this.projectId) return null;

    // Extract issue node ID from URL
    const issueMatch = issueUrl.match(/\/issues\/(\d+)$/);
    if (!issueMatch) return null;

    const issueNumber = parseInt(issueMatch[1], 10);
    const [owner, repo] = this.repo.split('/');

    const query = `
      query($owner: String!, $repo: String!, $issueNumber: Int!, $projectId: ID!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issueNumber) {
            projectItems(first: 10) {
              nodes {
                id
                project {
                  id
                }
              }
            }
          }
        }
      }
    `;

    try {
      const { stdout } = await execa('gh', [
        'api', 'graphql',
        '-f', `query=${query}`,
        '-F', `owner=${owner}`,
        '-F', `repo=${repo}`,
        '-F', `issueNumber=${issueNumber}`,
        '-F', `projectId=${this.projectId}`
      ]);

      const response = JSON.parse(stdout);
      const projectItems = response.data?.repository?.issue?.projectItems?.nodes || [];

      // Find the item that belongs to our project
      for (const item of projectItems) {
        if (item.project?.id === this.projectId) {
          return item.id;
        }
      }
    } catch (error) {
      console.warn('Could not fetch project item ID');
    }

    return null;
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
