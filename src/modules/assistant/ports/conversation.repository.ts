import type { Conversation } from '../domain/conversation.js';
export interface ConversationRepository {
  list(): Promise<Conversation[]>;
  get(id: string): Promise<Conversation>;
  create(value: Conversation): Promise<void>;
  update(id: string, change: (value: Conversation) => void): Promise<Conversation>;
}
