import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
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

// STUN only (no TURN) - free, no account needed, and enough for most
// home/office networks. Some restrictive networks (symmetric NAT, some
// carriers) won't be able to connect; adding a TURN server later is a
// config-only change here, not a rewrite.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const inboxChannelRef = useRef<RealtimeChannel | null>(null);
  // The ephemeral channel a caller opens on the callee's topic for the
  // duration of one outgoing call. Unset (null) when we're the callee -
  // in that case the permanent inbox channel below doubles as the
  // active-call channel, since it's already on the right topic.
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const pendingOfferRef = useRef<OfferPayload | null>(null);
  const pendingCandidatesRef = useRef<unknown[]>([]);
  const hasRemoteDescriptionRef = useRef(false);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  function activeChannel(): RealtimeChannel | null {
    return callChannelRef.current ?? inboxChannelRef.current;
  }

  function cleanupCall() {
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
    setPeer(null);
    setIsMuted(false);
    setIsCameraOff(false);
    statusRef.current = 'idle';
    setStatus('idle');
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
      void pc
        .setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }))
        .then(() => {
          hasRemoteDescriptionRef.current = true;
          const queued = pendingCandidatesRef.current;
          pendingCandidatesRef.current = [];
          for (const candidate of queued) {
            void pc.addIceCandidate(new RTCIceCandidate(candidate as any));
          }
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
      cleanupCall();
    });

    channel.on('broadcast', { event: 'call-decline' }, ({ payload }) => {
      if (payload.from === userIdRef.current) return;
      cleanupCall();
    });

    channel.on('broadcast', { event: 'call-busy' }, ({ payload }) => {
      if (payload.from === userIdRef.current) return;
      cleanupCall();
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
    });

    attachSignalingHandlers(channel);
    channel.subscribe();
    inboxChannelRef.current = channel;

    return () => {
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

      const channel = supabase.channel(`calls:${callPeer.peerUserId}`, {
        config: { private: true },
      });
      attachSignalingHandlers(channel);
      channel.subscribe((subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'call-offer',
            payload: {
              from: userId,
              callerName: ownProfile.display_name || ownProfile.email,
              callerAvatarPath: ownProfile.avatar_path,
              conversationId: callPeer.conversationId,
              sdp: offer.sdp,
            },
          });
        }
      });
      callChannelRef.current = channel;
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
    pendingOfferRef.current = null;
    setPeer(null);
    statusRef.current = 'idle';
    setStatus('idle');
  }, [userId]);

  const endCall = useCallback(() => {
    if (statusRef.current === 'idle') return;
    activeChannel()?.send({ type: 'broadcast', event: 'call-end', payload: { from: userId } });
    cleanupCall();
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
