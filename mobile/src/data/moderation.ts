import { supabase } from '../lib/supabase';

export type ReportReason = 'spam' | 'harassment' | 'inappropriate_content' | 'other';

export async function fetchBlockedUserIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', userId);

  if (error) throw error;
  return new Set((data as { blocked_id: string }[]).map((row) => row.blocked_id));
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });

  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  if (error) throw error;
}

// Reports are a one-way mailbox (see the reports table's RLS) - there's
// no read-back to confirm, just success/failure of the insert itself.
export async function reportUser(
  reporterId: string,
  reportedUserId: string,
  reason: ReportReason,
  options?: { messageId?: string; details?: string },
): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reason,
    message_id: options?.messageId ?? null,
    details: options?.details ?? null,
  });

  if (error) throw error;
}
