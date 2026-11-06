import { z } from 'zod';
import { Conversation, ChatInput } from '../domain/conversation.js';
export { Conversation, ChatInput };
export const ConversationList = z.array(
  Conversation.omit({ messages: true }).extend({ pending: z.boolean() }),
);
export const assistantRoutes = [
  ['get', '/api/assistant/conversations', 'listConversations', null, 'ConversationList', 200],
  ['post', '/api/assistant/conversations', 'createConversation', null, 'Conversation', 201],
  ['get', '/api/assistant/conversations/{id}', 'getConversation', null, 'Conversation', 200],
  [
    'post',
    '/api/assistant/conversations/{id}/messages',
    'sendMessage',
    'ChatInput',
    'Conversation',
    202,
  ],
] as const;
