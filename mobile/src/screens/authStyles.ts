import { StyleSheet } from 'react-native';
import { fonts, fontSizes, spacing, ThemeColors } from '../theme/tokens';

// Shared by Login, Register and Forgot password: a back button, a big
// title, labelled fields as white 54px boxes, one full-width violet
// button, and the switch-screen line at the bottom.
export const makeAuthStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: 'transparent',
      paddingHorizontal: spacing.xl,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.paper2,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xxl,
    },
    markTile: {
      width: 52,
      height: 52,
      borderRadius: 17,
      backgroundColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    markGlyph: { width: 26, height: 30 },
    title: {
      fontSize: 32,
      lineHeight: 35,
      fontFamily: fonts.family,
      fontWeight: '800',
      letterSpacing: -1,
      color: colors.ink,
      marginBottom: 10,
    },
    subtitle: {
      fontFamily: fonts.family,
      color: colors.smoke,
      fontSize: 16,
      lineHeight: 23,
      marginBottom: spacing.xxl,
    },
    field: {
      marginBottom: 14,
    },
    label: {
      fontFamily: fonts.family,
      fontSize: fontSizes.footnote,
      fontWeight: '600',
      color: colors.char,
      marginBottom: 6,
    },
    input: {
      fontFamily: fonts.family,
      minHeight: 54,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.paper2,
      borderRadius: 16,
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.ink,
    },
    hint: {
      fontFamily: fonts.family,
      fontSize: fontSizes.footnote,
      color: colors.smoke,
      marginTop: -8,
      marginBottom: 14,
    },
    forgotPasswordLink: {
      alignSelf: 'flex-end',
      minHeight: 44,
      justifyContent: 'center',
      marginTop: -spacing.sm,
    },
    forgotPasswordText: {
      fontFamily: fonts.family,
      fontSize: fontSizes.footnote,
      fontWeight: '600',
      color: colors.emberText,
    },
    error: { fontFamily: fonts.family, color: colors.danger, fontSize: 14, marginBottom: spacing.md },
    info: { fontFamily: fonts.family, color: colors.sage, fontSize: 14, marginBottom: spacing.md },
    spinner: { marginTop: spacing.sm },
    primaryButton: {
      marginTop: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.lg,
      borderRadius: 18,
      backgroundColor: colors.ember,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      fontFamily: fonts.family,
      color: '#FFFFFF',
      fontSize: fontSizes.bodyLg,
      fontWeight: '600',
    },
    spacer: { flex: 1, minHeight: spacing.xl },
    footer: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerText: {
      fontFamily: fonts.family,
      fontSize: fontSizes.body,
      color: colors.smoke,
      textAlign: 'center',
    },
    footerLink: { fontFamily: fonts.family, fontWeight: '700', color: colors.emberText },
  });
