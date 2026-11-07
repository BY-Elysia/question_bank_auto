import { z } from 'zod';
import { Conversation, ChatInput } from '../domain/conversation.js';
export { Conversation, ChatInput };
export const ConversationList = z.array(
  Conversation.omit({ messages: true }).extend({ pending: z.boolean() }),
);
export const assistantRoutes = [
  [
    'get',
    '/api/assistant/conversations/{id}/state',
    'getAssistantState',
    null,
    'AssistantState',
    200,
  ],
  [
    'patch',
    '/api/assistant/conversations/{id}',
    'renameConversation',
    'RenameConversation',
    'Conversation',
    200,
  ],
  ['delete', '/api/assistant/conversations/{id}', 'deleteConversation', null, null, 204],
  [
    'get',
    '/api/assistant/conversations/{id}/messages',
    'getConversationMessages',
    null,
    'MessagePage',
    200,
  ],
  [
    'post',
    '/api/assistant/conversations/{id}/runs',
    'startAssistantRun',
    'StartRun',
    'AssistantRunView',
    202,
  ],
  ['get', '/api/assistant/runs/{id}', 'getAssistantRun', null, 'AssistantRunView', 200],
  [
    'post',
    '/api/assistant/runs/{id}/inputs',
    'inputAssistantRun',
    'InputCommand',
    'AssistantRunView',
    202,
  ],
  ['post', '/api/assistant/runs/{id}/cancel', 'cancelAssistantRun', null, 'AssistantRunView', 201],
  ['post', '/api/assistant/runs/{id}/resume', 'resumeAssistantRun', null, 'AssistantRunView', 202],
  ['post', '/api/assistant/runs/{id}/retry', 'retryAssistantRun', null, 'AssistantRunView', 202],
  [
    'post',
    '/api/assistant/runs/{id}/interactions/{interactionId}/responses',
    'answerAssistantInteraction',
    'InteractionAnswer',
    'AssistantRunView',
    202,
  ],
  ['get', '/api/assistant/runs/{id}/events', 'streamAssistantEvents', null, 'RunEvents', 200],
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
export { StartRun, InputCommand, InteractionAnswer, AssistantRunView } from '../domain/run.js';
