import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import * as profilesData from '../data/profiles';
import * as conversationsData from '../data/conversations';
import { consumeAutoAnswer } from './autoAnswerFlag';
import type { CallStatus as CallLogStatus } from '../types';

// STUN only (no TURN) - free, no account needed, and enough for most
// home/office networks. Some restrictive networks (symmetric NAT, some
// carriers) won't be able to connect; adding a TURN server later is a
// config-only change here, not a rewrite.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// How long an outgoing call keeps ringing before giving up on its own -
// matches the offer-resend window below, since there's no point ringing
// past the point where the callee could still receive the offer. Mirrors
// how long a real phone call rings before giving up.
const RING_TIMEOUT_MS = 45000;

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connected';

export interface CallPeer {
  conversationId: string;
  peerUserId: string;
  peerName: string;
  peerAvatarPath: string | null;
}

interface OfferPayload {
  from: string;
  callerName: string;
  callerAvatarPath: string | null;
  conversationId: string;
  sdp: string;
}

interface CallContextValue {
  status: CallStatus;
  peer: CallPeer | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  startCall: (peer: CallPeer) => Promise<void>;
  answerCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

async function ensureCallPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return (
    granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
    granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
  );
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [status, setStatus] = useState<CallStatus>('idle');
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Mutable mirrors of the state above, read from inside the long-lived
  // realtime channel callbacks below - those closures are created once
  // (or once per effect run) and would otherwise see stale values, the
  // same class of bug already hit and fixed for ChatScreen's realtime
  // channel (see participantsRef there).
  const statusRef = useRef<CallStatus>('idle');
  const userIdRef = useRef<string | null>(null);
  const peerRef = useRef<CallPeer | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Set the moment a call reaches 'connected', on whichever side - used
  // to compute the logged call duration.
  const connectedAtRef = useRef<number | null>(null);
  const inboxChannelRef = useRef<RealtimeChannel | null>(null);
  // The ephemeral channel a caller opens on the callee's topic for the
  // duration of one outgoing call. Unset (null) when we're the callee -
  // in that case the permanent inbox channel below doubles as the
  // active-call channel, since it's already on the right topic.
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const pendingOfferRef = useRef<OfferPayload | null>(null);
  const pendingCandidatesRef = useRef<unknown[]>([]);
  const hasRemoteDescriptionRef = useRef(false);
  // The callee's realtime channel may not be subscribed yet the moment a
  // call-offer first goes out - most commonly right after a push wakes
  // their app from background/killed, which takes a beat to get through
  // login/session restore and back to this provider. Resending the same
  // offer for a few seconds covers that without needing to embed the SDP
  // in the push payload itself.
  const offerResendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Auto-hangs-up an outgoing call that never gets answered - without
  // this, "Calling..." would sit there forever until the caller manually
  // cancels, since nothing else ever transitions it out of that state.
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopOfferResend() {
    if (offerResendTimerRef.current) {
      clearInterval(offerResendTimerRef.current);
      offerResendTimerRef.current = null;
    }
  }

  function stopCallTimeout() {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    peerRef.current = peer;
  }, [peer]);

  function activeChannel(): RealtimeChannel | null {
    return callChannelRef.current ?? inboxChannelRef.current;
  }

  // Only the caller logs a call-summary message (see sendCallLogMessage) -
  // both participants read the same row anyway, since it's a normal
  // message in their shared conversation. `fallbackOutcome` is what to
  // log if the call never connected; a call that DID connect always logs
  // as 'completed' with its duration regardless of what's passed, since
  // however it ended at that point, it still happened.
  function cleanupCall(fallbackOutcome: 'missed' | 'declined') {
    const wasCaller = callChannelRef.current !== null;
    const wasConnected = statusRef.current === 'connected';
    const currentPeer = peerRef.current;
    const currentUserId = userIdRef.current;
    const connectedAt = connectedAtRef.current;

    stopOfferResend();
    stopCallTimeout();
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    if (callChannelRef.current) {
      void supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    hasRemoteDescriptionRef.current = false;
    connectedAtRef.current = null;
    setPeer(null);
    setIsMuted(false);
    setIsCameraOff(false);
    statusRef.current = 'idle';
    setStatus('idle');

    if (wasCaller && currentPeer && currentUserId) {
      const outcome: CallLogStatus = wasConnected ? 'completed' : fallbackOutcome;
      const durationMs = wasConnected && connectedAt ? Date.now() - connectedAt : null;
      void conversationsData
        .sendCallLogMessage(currentPeer.conversationId, currentUserId, outcome, durationMs)
        .catch(() => {
          // best-effort - a missing call-log entry isn't worth surfacing an error for
        });
    }
  }

  function createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // react-native-webrtc's on* setters are typed against a generic
    // Event<string>, not the specific RTCIceCandidateEvent/RTCTrackEvent
    // shapes it actually fires (several of its own methods are typed
    // `any` for the same reason) - `any` here matches that looseness
    // rather than fighting it.
    pc.onicecandidate = (event: any) => {
      if (!event.candidate || !userIdRef.current) return;
      activeChannel()?.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: { from: userIdRef.current, candidate: event.candidate.toJSON() },
      });
    };

    pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) setRemoteStream(event.streams[0]);
    };

    return pc;
  }

  function attachSignalingHandlers(channel: RealtimeChannel) {
    channel.on('broadcast', { event: 'call-answer' }, ({ payload }) => {
      if (payload.from === userIdRef.current || statusRef.current !== 'outgoing' || !pcRef.current) {
        return;
      }
      const pc = pcRef.current;
      stopOfferResend();
      stopCallTimeout();
      void pc
        .setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }))
        .then(() => {
          hasRemoteDescriptionRef.current = true;
          const queued = pendingCandidatesRef.current;
          pendingCandidatesRef.current = [];
          for (const candidate of queued) {
            void pc.addIceCandidate(new RTCIceCandidate(candidate as any));
          }
          connectedAtRef.current = Date.now();
          statusRef.current = 'connected';
          setStatus('connected');
        });
    });

    channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
      if (payload.from === userIdRef.current) return;
      if (hasRemoteDescriptionRef.current && pcRef.current) {
        void pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        pendingCandidatesRef.current.push(payload.candidate);
      }
    });

    channel.on('broadcast', { event: 'call-end' }, ({ payload }) => {
      if (payload.from === userIdRef.current) return;
      cleanupCall('missed');
    });

    channel.on('broadcast', { event: 'call-decline' }, ({ payload }) => {
      if (payload.from === userIdRef.current) return;
      cleanupCall('declined');
    });

    channel.on('broadcast', { event: 'call-busy' }, ({ payload }) => {
      if (payload.from === userIdRef.current) return;
      cleanupCall('missed');
    });
  }

  // Permanent, subscribed for as long as the app has a signed-in user -
  // this is how an incoming call can reach the user regardless of which
  // screen they're on.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`calls:${userId}`, { config: { private: true } });

    channel.on('broadcast', { event: 'call-offer' }, ({ payload }) => {
      const offer = payload as OfferPayload;
      if (offer.from === userId) return;

      // A resent copy of the offer already being shown (see startCall's
      // offerResendTimerRef) - not a second, concurrent call.
      if (statusRef.current === 'incoming' && pendingOfferRef.current?.from === offer.from) {
        pendingOfferRef.current = offer;
        return;
      }

      if (statusRef.current !== 'idle') {
        const busyChannel = supabase.channel(`calls:${offer.from}`, {
          config: { private: true },
        });
        busyChannel.subscribe((subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            busyChannel.send({ type: 'broadcast', event: 'call-busy', payload: { from: userId } });
            setTimeout(() => void supabase.removeChannel(busyChannel), 1000);
          }
        });
        return;
      }

      pendingOfferRef.current = offer;
      setPeer({
        conversationId: offer.conversationId,
        peerUserId: offer.from,
        peerName: offer.callerName,
        peerAvatarPath: offer.callerAvatarPath,
      });
      statusRef.current = 'incoming';
      setStatus('incoming');

      // Picks up a tap on the notification's "Answer" action (see
      // autoAnswerFlag.ts) - that action can only launch the app, not
      // answer directly, since answering needs this real offer and a
      // live PeerConnection that don't exist until now.
      void consumeAutoAnswer(offer.from).then((shouldAutoAnswer) => {
        if (shouldAutoAnswer) void answerCall();
      });
    });

    attachSignalingHandlers(channel);
    channel.subscribe();
    inboxChannelRef.current = channel;

    // Mobile OSes kill idle sockets for backgrounded apps to save battery,
    // so this channel's websocket can silently die while the app isn't in
    // the foreground - realtime-js's own reconnect backoff is a JS timer,
    // which itself gets throttled while backgrounded and may not fire
    // promptly on resume. Forcing a resubscribe the moment the app becomes
    // active again closes that gap instead of waiting on it.
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (channel.state === 'joined' || channel.state === 'joining') return;
      channel.subscribe();
    });

    return () => {
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
      inboxChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const startCall = useCallback(
    async (callPeer: CallPeer) => {
      if (!userId || statusRef.current !== 'idle') return;
      const allowed = await ensureCallPermissions();
      if (!allowed) return;

      setPeer(callPeer);
      statusRef.current = 'outgoing';
      setStatus('outgoing');

      try {
        const [ownProfile, stream] = await Promise.all([
          profilesData.fetchProfile(userId),
          mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } }),
        ]);
        localStreamRef.current = stream;
        setLocalStream(stream);

        const pc = createPeerConnection();
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const offerPayload = {
          from: userId,
          callerName: ownProfile.display_name || ownProfile.email,
          callerAvatarPath: ownProfile.avatar_path,
          conversationId: callPeer.conversationId,
          sdp: offer.sdp,
        };

        const channel = supabase.channel(`calls:${callPeer.peerUserId}`, {
          config: { private: true },
        });
        attachSignalingHandlers(channel);
        channel.subscribe((subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            channel.send({ type: 'broadcast', event: 'call-offer', payload: offerPayload });

            // Covers the callee's device being backgrounded/killed: the
            // push notification below wakes it and shows a ringing UI, but
            // that takes a moment - a killed app needs to cold-start and
            // reconnect its realtime channel before it can receive
            // anything (observed to take several seconds by itself on a
            // real device), on top of however long the person takes to
            // notice the ring, unlock their phone, and tap Answer. 45s
            // gives that whole chain realistic room, similar to how long a
            // real phone call rings before giving up. A live callee's
            // client just gets the same offer multiple times, which it
            // handles fine (statusRef is no longer 'idle' after the
            // first, so repeats are ignored).
            offerResendTimerRef.current = setInterval(() => {
              channel.send({ type: 'broadcast', event: 'call-offer', payload: offerPayload });
            }, 2500);
            setTimeout(stopOfferResend, RING_TIMEOUT_MS);
            callTimeoutRef.current = setTimeout(() => {
              if (statusRef.current === 'outgoing') endCall();
            }, RING_TIMEOUT_MS);
          }
        });
        callChannelRef.current = channel;

        // Best-effort wake-up push for the callee - if this fails (e.g. no
        // network to the edge function), the call still proceeds via
        // realtime for anyone with the app already open.
        void supabase.functions
          .invoke('send-call-notification', {
            body: { conversationId: callPeer.conversationId, calleeUserId: callPeer.peerUserId },
          })
          .catch(() => {});
      } catch {
        // Nothing was ever signaled to the other person (callChannelRef
        // is still unset), so this cleans up locally without logging a
        // call - camera/mic access failing, or the profile fetch
        // failing, shouldn't leave the call stuck in "outgoing" forever.
        cleanupCall('missed');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const answerCall = useCallback(async () => {
    if (!userId || statusRef.current !== 'incoming' || !pendingOfferRef.current) return;
    const offer = pendingOfferRef.current;
    const allowed = await ensureCallPermissions();
    if (!allowed) {
      declineCall();
      return;
    }

    const stream = await mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } });
    localStreamRef.current = stream;
    setLocalStream(stream);

    const pc = createPeerConnection();
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer.sdp }));
    hasRemoteDescriptionRef.current = true;
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate as any));
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    inboxChannelRef.current?.send({
      type: 'broadcast',
      event: 'call-answer',
      payload: { from: userId, sdp: answer.sdp },
    });

    connectedAtRef.current = Date.now();
    statusRef.current = 'connected';
    setStatus('connected');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const declineCall = useCallback(() => {
    if (statusRef.current !== 'incoming' || !pendingOfferRef.current) return;
    inboxChannelRef.current?.send({
      type: 'broadcast',
      event: 'call-decline',
      payload: { from: userId },
    });
    // Never logged (wasCaller is always false here, since only the
    // caller's side ever sets callChannelRef) - the fallback outcome is
    // just to satisfy cleanupCall's signature.
    cleanupCall('declined');
  }, [userId]);

  const endCall = useCallback(() => {
    if (statusRef.current === 'idle') return;
    activeChannel()?.send({ type: 'broadcast', event: 'call-end', payload: { from: userId } });
    cleanupCall('missed');
  }, [userId]);

  const toggleMute = useCallback(() => {
    setIsMuted((current) => {
      const next = !current;
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setIsCameraOff((current) => {
      const next = !current;
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const switchCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    // _switchCamera is react-native-webrtc's (undocumented-looking but
    // standard) way to flip front/rear camera on a live video track.
    (track as unknown as { _switchCamera?: () => void } | undefined)?._switchCamera?.();
  }, []);

  return (
    <CallContext.Provider
      value={{
        status,
        peer,
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        startCall,
        answerCall,
        declineCall,
        endCall,
        toggleMute,
        toggleCamera,
        switchCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
}
