import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static';
import { RTCView } from 'react-native-webrtc';
import { useCall } from './CallContext';
import { Avatar } from '../components/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { radii, spacing, ThemeColors } from '../theme/tokens';

// Rendered once at the app root (see App.tsx) so an incoming call can
// surface as a full-screen overlay regardless of which screen is
// currently on the navigation stack.
export function CallOverlay() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    status,
    peer,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
  } = useCall();

  if (status === 'idle' || !peer) return null;

  const statusLabel =
    status === 'incoming'
      ? t('call.incoming')
      : status === 'outgoing'
        ? t('call.calling')
        : t('call.connected');

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.container}>
        {remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : (
          <View style={StyleSheet.absoluteFill} />
        )}

        <View style={[styles.topBar, { paddingTop: insets.top + spacing.xl }]}>
          <Avatar name={peer.peerName} avatarPath={peer.peerAvatarPath} size={84} />
          <Text style={styles.peerName}>{peer.peerName}</Text>
          <Text style={styles.statusLabel}>{statusLabel}</Text>
        </View>

        {localStream && !isCameraOff && (
          <View style={[styles.localPreview, { top: insets.top + spacing.lg }]}>
            <RTCView
              streamURL={localStream.toURL()}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
              mirror
              zOrder={1}
            />
          </View>
        )}

        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.xl }]}>
          {status === 'incoming' ? (
            <>
              <TouchableOpacity
                style={[styles.controlButton, styles.declineButton]}
                onPress={declineCall}
              >
                <FontAwesome6 name="phone-slash" iconStyle="solid" size={22} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.acceptButton]}
                onPress={() => void answerCall()}
              >
                <FontAwesome6 name="phone" iconStyle="solid" size={22} color={colors.white} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.controlButton} onPress={toggleMute}>
                <FontAwesome6
                  name={isMuted ? 'microphone-slash' : 'microphone'}
                  iconStyle="solid"
                  size={19}
                  color={colors.white}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlButton} onPress={toggleCamera}>
                <FontAwesome6
                  name={isCameraOff ? 'video-slash' : 'video'}
                  iconStyle="solid"
                  size={19}
                  color={colors.white}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlButton} onPress={switchCamera}>
                <FontAwesome6 name="camera-rotate" iconStyle="solid" size={19} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.declineButton]}
                onPress={endCall}
              >
                <FontAwesome6 name="phone-slash" iconStyle="solid" size={22} color={colors.white} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.char },
    topBar: {
      alignItems: 'center',
      gap: 6,
    },
    peerName: { fontSize: 22, fontWeight: '700', color: colors.white, marginTop: spacing.md },
    statusLabel: { fontSize: 14.5, color: 'rgba(255, 255, 255, 0.75)' },
    localPreview: {
      position: 'absolute',
      right: spacing.lg,
      width: 100,
      height: 150,
      borderRadius: radii.md,
      overflow: 'hidden',
      backgroundColor: colors.ink,
    },
    controls: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.lg,
    },
    controlButton: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    acceptButton: { backgroundColor: colors.sage },
    declineButton: { backgroundColor: colors.danger },
  });
