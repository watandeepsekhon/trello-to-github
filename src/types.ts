import { z } from 'zod';

// Trello Data Structures
export const TrelloMemberSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  fullName: z.string().optional(),
  initials: z.string().optional(),
});

export const TrelloLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
});

export const TrelloCheckItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['complete', 'incomplete']),
  pos: z.number().optional(),
});

export const TrelloChecklistSchema = z.object({
  id: z.string(),
  name: z.string(),
  checkItems: z.array(TrelloCheckItemSchema),
  pos: z.number().optional(),
});

export const TrelloActionSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.unknown()),
  date: z.string(),
  memberCreator: TrelloMemberSchema.optional(),
});

export const TrelloCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().optional(),
  closed: z.boolean().optional(),
  idList: z.string(),
  idLabels: z.array(z.string()).optional(),
  idMembers: z.array(z.string()).optional(),
  idChecklists: z.array(z.string()).optional(),
  labels: z.array(TrelloLabelSchema).optional(),
  pos: z.number().optional(),
  url: z.string().optional(),
  shortLink: z.string().optional(),
  dateLastActivity: z.string().optional(),
});

export const TrelloListSchema = z.object({
  id: z.string(),
  name: z.string(),
  closed: z.boolean().optional(),
  pos: z.number().optional(),
});

export const TrelloBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().optional(),
  lists: z.array(TrelloListSchema),
  cards: z.array(TrelloCardSchema),
  labels: z.array(TrelloLabelSchema).optional(),
  members: z.array(TrelloMemberSchema).optional(),
  checklists: z.array(TrelloChecklistSchema).optional(),
  actions: z.array(TrelloActionSchema).optional(),
});

// Inferred TypeScript types
export type TrelloMember = z.infer<typeof TrelloMemberSchema>;
export type TrelloLabel = z.infer<typeof TrelloLabelSchema>;
export type TrelloCheckItem = z.infer<typeof TrelloCheckItemSchema>;
export type TrelloChecklist = z.infer<typeof TrelloChecklistSchema>;
export type TrelloAction = z.infer<typeof TrelloActionSchema>;
export type TrelloCard = z.infer<typeof TrelloCardSchema>;
export type TrelloList = z.infer<typeof TrelloListSchema>;
export type TrelloBoard = z.infer<typeof TrelloBoardSchema>;

// GitHub Project Configuration
export interface GitHubProjectColumn {
  name: string;
  id?: string;
}

export interface ListMapping {
  trelloListId: string;
  trelloListName: string;
  githubColumn: string | null; // null means skip this list
  isEpic: boolean;
}

export interface EpicStrategy {
  type: 'custom-field' | 'parent-child';
  customFieldName?: string; // Only used if type is 'custom-field'
}

export interface ImportConfig {
  trelloFilePath: string;
  githubRepo: string; // format: "owner/repo"
  githubProject?: string; // Project name or number
  projectOwner?: string; // Project owner (if different from repo owner)
  listMappings: ListMapping[];
  epicStrategy: EpicStrategy;
  dryRun: boolean;
  resume?: boolean; // Skip already imported cards
  onlyEpics?: boolean; // Only import epic cards
}

export interface Checkpoint {
  importedCards: Set<string>; // Trello card IDs that have been imported
  mapping: Record<string, string>; // Trello card ID -> GitHub issue number
}

export interface ImportResult {
  cardsImported: number;
  cardsSkipped: number;
  issuesCreated: string[]; // GitHub issue URLs
  mapping: Record<string, string>; // Trello card ID -> GitHub issue number
  errors: string[];
}

// Comment data for preserving Trello comment metadata
export interface TrelloComment {
  id: string;
  author: string;
  date: string;
  text: string;
}
