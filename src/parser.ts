import { readFile } from 'fs/promises';
import {
  TrelloBoardSchema,
  type TrelloBoard,
  type TrelloCard,
  type TrelloList,
  type TrelloComment,
  type TrelloChecklist,
  type TrelloLabel,
} from './types.js';

export class TrelloParser {
  private board: TrelloBoard;

  constructor(board: TrelloBoard) {
    this.board = board;
  }

  /**
   * Load and parse a Trello JSON export file
   */
  static async fromFile(filePath: string): Promise<TrelloParser> {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const board = TrelloBoardSchema.parse(data);
    return new TrelloParser(board);
  }

  /**
   * Get the board data
   */
  getBoard(): TrelloBoard {
    return this.board;
  }

  /**
   * Get all lists (columns) from the board
   */
  getLists(): TrelloList[] {
    return this.board.lists.filter(list => !list.closed);
  }

  /**
   * Get all active (non-archived, non-closed) cards
   */
  getActiveCards(): TrelloCard[] {
    return this.board.cards.filter(card => {
      // Skip archived cards
      if (card.closed) {
        return false;
      }

      // Skip cards in closed lists
      const list = this.board.lists.find(l => l.id === card.idList);
      if (list?.closed) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get cards by list ID
   */
  getCardsByList(listId: string): TrelloCard[] {
    return this.getActiveCards().filter(card => card.idList === listId);
  }

  /**
   * Get list by ID
   */
  getList(listId: string): TrelloList | undefined {
    return this.board.lists.find(list => list.id === listId);
  }

  /**
   * Get labels for a card
   */
  getCardLabels(card: TrelloCard): TrelloLabel[] {
    if (!card.labels || card.labels.length === 0) {
      return [];
    }
    return card.labels;
  }

  /**
   * Get checklists for a card
   */
  getCardChecklists(card: TrelloCard): TrelloChecklist[] {
    if (!card.idChecklists || !this.board.checklists) {
      return [];
    }

    return this.board.checklists
      .filter(checklist => card.idChecklists?.includes(checklist.id))
      .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  }

  /**
   * Get comments for a card
   * Comments are stored in the actions array with type "commentCard"
   */
  getCardComments(card: TrelloCard): TrelloComment[] {
    if (!this.board.actions) {
      return [];
    }

    const comments: TrelloComment[] = [];

    for (const action of this.board.actions) {
      if (action.type === 'commentCard' && action.data.card?.id === card.id) {
        const author = action.memberCreator?.fullName
          || action.memberCreator?.username
          || 'Unknown';

        const text = typeof action.data.text === 'string' ? action.data.text : '';

        comments.push({
          id: action.id,
          author,
          date: action.date,
          text,
        });
      }
    }

    // Sort comments by date (oldest first)
    return comments.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  /**
   * Convert checklist to GitHub task list markdown
   */
  checklistToMarkdown(checklist: TrelloChecklist): string {
    const lines: string[] = [];

    if (checklist.name) {
      lines.push(`### ${checklist.name}`);
      lines.push('');
    }

    const sortedItems = [...checklist.checkItems].sort((a, b) =>
      (a.pos ?? 0) - (b.pos ?? 0)
    );

    for (const item of sortedItems) {
      const checkbox = item.state === 'complete' ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${item.name}`);
    }

    return lines.join('\n');
  }

  /**
   * Format a card's complete description for GitHub issue
   */
  formatCardDescription(card: TrelloCard): string {
    const parts: string[] = [];

    // Original description
    if (card.desc && card.desc.trim()) {
      parts.push(card.desc.trim());
    }

    // Checklists
    const checklists = this.getCardChecklists(card);
    if (checklists.length > 0) {
      if (parts.length > 0) {
        parts.push(''); // Empty line separator
      }

      for (const checklist of checklists) {
        parts.push(this.checklistToMarkdown(checklist));
        parts.push(''); // Empty line between checklists
      }
    }

    // Add Trello link as reference
    if (card.url) {
      if (parts.length > 0) {
        parts.push(''); // Empty line separator
      }
      parts.push('---');
      parts.push(`_Original Trello card: ${card.url}_`);
    }

    return parts.join('\n');
  }

  /**
   * Get statistics about the board
   */
  getStats() {
    const activeCards = this.getActiveCards();
    const archivedCards = this.board.cards.filter(c => c.closed);

    return {
      totalLists: this.getLists().length,
      totalCards: this.board.cards.length,
      activeCards: activeCards.length,
      archivedCards: archivedCards.length,
      totalLabels: this.board.labels?.length ?? 0,
      totalMembers: this.board.members?.length ?? 0,
    };
  }
}
