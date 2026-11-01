import { PollVote } from '../types';

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 10;
export const MAX_QUESTION_LENGTH = 300;
// The server caps a poll's options at 1000 characters between them.
export const MAX_OPTION_LENGTH = 100;

export interface PollDraft {
  question: string;
  options: string[];
}

// What's actually sent, or null when it isn't a poll yet. Blank rows are
// dropped rather than refused, and so are repeats: two identical choices split
// the vote with no way to tell them apart.
export function cleanPollDraft(question: string, options: string[]): PollDraft | null {
  const cleanQuestion = question.trim();
  const seen = new Set<string>();
  const cleanOptions: string[] = [];
  for (const option of options) {
    const clean = option.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    cleanOptions.push(clean);
  }
  if (!cleanQuestion || cleanOptions.length < MIN_POLL_OPTIONS) return null;
  return { question: cleanQuestion, options: cleanOptions };
}

export interface PollTally {
  counts: number[];
  total: number;
  myChoice: number | null;
}

export function tallyPoll(
  optionCount: number,
  votes: PollVote[],
  userId: string | null,
): PollTally {
  const counts = new Array<number>(optionCount).fill(0);
  let total = 0;
  let myChoice: number | null = null;
  for (const vote of votes) {
    const choice = vote.option_index;
    if (choice === null || choice < 0 || choice >= optionCount) continue;
    counts[choice] += 1;
    total += 1;
    if (vote.user_id === userId) myChoice = choice;
  }
  return { counts, total, myChoice };
}

// One row per person, so a newer vote replaces their older one.
export function mergePollVote(votes: PollVote[], vote: PollVote): PollVote[] {
  const others = votes.filter(
    (v) => !(v.message_id === vote.message_id && v.user_id === vote.user_id),
  );
  return [...others, vote];
}
