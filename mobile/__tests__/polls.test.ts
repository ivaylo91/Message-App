import { cleanPollDraft, mergePollVote, tallyPoll } from '../src/polls/polls';
import { PollVote } from '../src/types';

const vote = (user: string, choice: number | null, message = 'p1'): PollVote => ({
  message_id: message,
  user_id: user,
  conversation_id: 'c1',
  option_index: choice,
});

describe('cleanPollDraft', () => {
  it('trims and drops blank rows', () => {
    expect(cleanPollDraft('  Saturday? ', [' Yes ', '', '  ', 'No'])).toEqual({
      question: 'Saturday?',
      options: ['Yes', 'No'],
    });
  });

  it('drops repeats, whatever their case', () => {
    expect(cleanPollDraft('Saturday?', ['Yes', 'yes', 'No'])?.options).toEqual(['Yes', 'No']);
  });

  it('needs a question', () => {
    expect(cleanPollDraft('   ', ['Yes', 'No'])).toBeNull();
  });

  it('needs two different options', () => {
    expect(cleanPollDraft('Saturday?', ['Yes', 'YES', ''])).toBeNull();
  });
});

describe('tallyPoll', () => {
  it('counts each option and finds my choice', () => {
    expect(tallyPoll(3, [vote('me', 1), vote('a', 1), vote('b', 2)], 'me')).toEqual({
      counts: [0, 2, 1],
      total: 3,
      myChoice: 1,
    });
  });

  it('leaves out withdrawn votes', () => {
    expect(tallyPoll(2, [vote('me', null), vote('a', 0)], 'me')).toEqual({
      counts: [1, 0],
      total: 1,
      myChoice: null,
    });
  });

  it('ignores a choice the poll does not have', () => {
    expect(tallyPoll(2, [vote('a', 5)], 'me').total).toBe(0);
  });
});

describe('mergePollVote', () => {
  it('replaces the same person in the same poll', () => {
    expect(mergePollVote([vote('me', 0), vote('a', 1)], vote('me', 1))).toEqual([
      vote('a', 1),
      vote('me', 1),
    ]);
  });

  it('keeps the same person in another poll', () => {
    expect(mergePollVote([vote('me', 0, 'p2')], vote('me', 1))).toHaveLength(2);
  });
});
