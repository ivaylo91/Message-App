export type CallMedia = 'audio' | 'video';

// What a call-log message stores in attachment_mime_type to say it was a voice
// call; video calls leave it empty, which is what every call before voice
// calling looks like. A column would read better, but the chat list selects
// its columns by name, so a new one would break it on any database not yet
// migrated. This one already exists and calls don't otherwise use it.
export const VOICE_CALL_MARKER = 'audio/call';

// Only voice-capable apps send this, so no value means video.
export function offerMedia(offer: { media?: string }): CallMedia {
  return offer.media === 'audio' ? 'audio' : 'video';
}

export function mediaConstraints(media: CallMedia) {
  return media === 'audio'
    ? { audio: true, video: false }
    : { audio: true, video: { facingMode: 'user' } };
}

export function isVoiceCallLog(message: { attachment_mime_type?: string | null }): boolean {
  return message.attachment_mime_type === VOICE_CALL_MARKER;
}
