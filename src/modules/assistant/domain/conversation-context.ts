import type { Conversation } from './conversation.js';
/** Bounded recent dialogue, independent of UI and any provider SDK. */
export function conversationContext(conversation: Conversation, maxCharacters = 64000) {
  const complete = conversation.messages.filter(
    (m) => m.status === 'complete' && m.content.trim().length > 0,
  );
  let size = 0;
  const selected: typeof complete = [];
  for (const message of [...complete].reverse()) {
    if (selected.length >= 40 || size + message.content.length > maxCharacters) break;
    selected.push(message);
    size += message.content.length;
  }
  return selected.reverse().map(({ role, content }) => ({ role, content }));
}
