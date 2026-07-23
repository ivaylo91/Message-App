export function conversationMessagesTopic(conversationId: string): string {
  return `conversations/${conversationId}/messages`;
}
