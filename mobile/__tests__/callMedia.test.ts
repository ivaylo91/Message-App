import {
  isVoiceCallLog,
  mediaConstraints,
  offerMedia,
  VOICE_CALL_MARKER,
} from '../src/calling/callMedia';

describe('offerMedia', () => {
  it('reads a voice offer', () => {
    expect(offerMedia({ media: 'audio' })).toBe('audio');
  });

  it('treats an offer from an older app, which has no media, as video', () => {
    expect(offerMedia({})).toBe('video');
  });

  it('treats anything unrecognised as video', () => {
    expect(offerMedia({ media: 'hologram' })).toBe('video');
  });
});

describe('mediaConstraints', () => {
  it('never opens the camera for a voice call', () => {
    expect(mediaConstraints('audio')).toEqual({ audio: true, video: false });
  });

  it('asks for both on a video call', () => {
    expect(mediaConstraints('video')).toEqual({ audio: true, video: { facingMode: 'user' } });
  });
});

describe('isVoiceCallLog', () => {
  it('recognises the marker', () => {
    expect(isVoiceCallLog({ attachment_mime_type: VOICE_CALL_MARKER })).toBe(true);
  });

  it('reads every call logged before voice calling as video', () => {
    expect(isVoiceCallLog({ attachment_mime_type: null })).toBe(false);
    expect(isVoiceCallLog({})).toBe(false);
  });
});
