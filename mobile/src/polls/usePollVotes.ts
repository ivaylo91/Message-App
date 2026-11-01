import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import * as pollsData from '../data/polls';
import { supabase } from '../lib/supabase';
import { PollVote } from '../types';
import { mergePollVote } from './polls';

// Votes for the polls loaded in one chat, kept live. A channel of its own
// rather than another listener on ChatScreen's: it only opens in a chat that
// has a poll, and a failure here can't take messages down with it.
export function usePollVotes(
  conversationId: string,
  messages: { id: string; poll_options?: string[] | null }[],
  userId: string | null,
) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [votes, setVotes] = useState<PollVote[]>([]);
  // For onVote to read, so it keeps one identity and bubbles keep their memo.
  const votesRef = useRef(votes);
  votesRef.current = votes;

  // A string, so a new array of the same polls doesn't refetch anything.
  const pollIdsKey = useMemo(
    () => messages.filter((m) => m.poll_options).map((m) => m.id).join(','),
    [messages],
  );

  const load = useCallback(async () => {
    if (!pollIdsKey) return;
    try {
      setVotes(await pollsData.fetchPollVotes(pollIdsKey.split(',')));
    } catch {
      // The tallies stay as they were; the next change brings them up to date.
    }
  }, [pollIdsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasPolls = pollIdsKey.length > 0;
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!hasPolls) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    // Same guard as ChatScreen's realtime effect: channel() hands back an
    // existing channel under this topic, and removeChannel() is async.
    void (async () => {
      const topic = `poll-votes:${conversationId}`;
      const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;

      channel = supabase
        .channel(topic)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'poll_votes',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            setVotes((current) => mergePollVote(current, payload.new as PollVote));
          },
        )
        // Also fires on every reconnect, which picks up whatever was missed.
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void loadRef.current();
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, hasPolls]);

  const onVote = useCallback(
    (messageId: string, optionIndex: number) => {
      if (!userId) return;
      const previous = votesRef.current.find(
        (v) => v.message_id === messageId && v.user_id === userId,
      );
      // Tapping your own choice again takes the vote back.
      const choice = previous?.option_index === optionIndex ? null : optionIndex;
      const vote = {
        message_id: messageId,
        user_id: userId,
        conversation_id: conversationId,
        option_index: choice,
      };
      setVotes((current) => mergePollVote(current, vote));
      pollsData.castPollVote(messageId, choice).catch(() => {
        setVotes((current) => mergePollVote(current, previous ?? { ...vote, option_index: null }));
        showToast(t('polls.voteFailedToast'), 'error');
      });
    },
    [conversationId, userId, showToast, t],
  );

  const votesByMessageId = useMemo(() => {
    const map = new Map<string, PollVote[]>();
    for (const vote of votes) {
      const existing = map.get(vote.message_id);
      if (existing) existing.push(vote);
      else map.set(vote.message_id, [vote]);
    }
    return map;
  }, [votes]);

  return { votesByMessageId, onVote };
}
