// Where a message sits within a run of consecutive messages from the same
// sender, described in the order a reader sees them top-to-bottom:
// 'first' is the top of a run, 'last' the bottom, 'single' a message
// standing alone.
export type RunPosition = 'single' | 'first' | 'middle' | 'last';

// Messages closer together than this are treated as one continuous run.
// Longer than that and they read as separate remarks even from the same
// person, so they get their own bubbles.
const RUN_GAP_MS = 5 * 60 * 1000;

interface GroupableMessage {
  id: string;
  sender_id: string;
  created_at: string;
}

function continues(older: GroupableMessage, newer: GroupableMessage): boolean {
  if (older.sender_id !== newer.sender_id) return false;
  const gap =
    new Date(newer.created_at).getTime() - new Date(older.created_at).getTime();
  // Math.abs, because a pending message stamped from the device clock can
  // land slightly *before* the server-stamped message above it - clock
  // skew shouldn't split a run.
  return Math.abs(gap) <= RUN_GAP_MS;
}

// Takes the list exactly as ChatScreen holds it - newest first, matching
// its inverted FlatList - and says where each message sits in its run.
//
// Every bubble having the same fully-rounded shape made consecutive
// messages from one person read as a stack of separate islands rather
// than as someone talking. Knowing the run position lets the bubble
// flatten the corner facing its neighbour, and lets a group chat print
// the sender's name once per run instead of on every line.
export function runPositions(
  messagesNewestFirst: GroupableMessage[],
): Map<string, RunPosition> {
  const positions = new Map<string, RunPosition>();

  for (let i = 0; i < messagesNewestFirst.length; i++) {
    const message = messagesNewestFirst[i];
    // i + 1 is the message *above* this one on screen (older); i - 1 is
    // the one below (newer).
    const above = messagesNewestFirst[i + 1];
    const below = messagesNewestFirst[i - 1];

    const joinsAbove = above !== undefined && continues(above, message);
    const joinsBelow = below !== undefined && continues(message, below);

    let position: RunPosition;
    if (joinsAbove && joinsBelow) position = 'middle';
    else if (joinsAbove) position = 'last';
    else if (joinsBelow) position = 'first';
    else position = 'single';

    positions.set(message.id, position);
  }

  return positions;
}

// The sender's name belongs at the top of a run only - repeating it on
// every bubble is what made group chats look like a log file.
export function showsSenderName(position: RunPosition): boolean {
  return position === 'first' || position === 'single';
}
