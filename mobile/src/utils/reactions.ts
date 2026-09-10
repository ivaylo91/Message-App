import { MessageReaction } from '../types';

// Adds a newly-fetched page's reactions to the ones already held,
// dropping any already present - a page boundary can overlap with what
// realtime has meanwhile delivered, and a duplicate would be counted
// twice in the bubble's reaction summary. Returns the original array
// unchanged when there's nothing new, so React can skip the re-render.
export function mergeReactions(
  current: MessageReaction[],
  incoming: MessageReaction[],
): MessageReaction[] {
  if (incoming.length === 0) return current;
  const known = new Set(current.map((r) => r.id));
  const added = incoming.filter((r) => !known.has(r.id));
  return added.length > 0 ? [...current, ...added] : current;
}
