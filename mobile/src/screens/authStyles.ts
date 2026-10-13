import { StyleSheet } from 'react-native';
import { fonts, radii, spacing, ThemeColors } from '../theme/tokens';

export const makeAuthStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      padding: spacing.xxl,
    },
    title: {
      fontSize: 25,
      fontFamily: fonts.family, fontWeight: '800',
      letterSpacing: -0.2,
      color: colors.ink,
      marginBottom: 6,
    },
    subtitle: {
      fontFamily: fonts.family,
      color: colors.smoke,
      fontSize: 14.5,
      lineHeight: 20,
      marginBottom: 28,
    },
    field: {
      marginBottom: spacing.lg,
    },
    label: {
      fontFamily: fonts.family,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.smoke,
      marginBottom: 7,
    },
    input: {
      fontFamily: fonts.family,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.paper2,
      borderRadius: radii.md,
      padding: 13,
      fontSize: 15,
      color: colors.ink,
    },
    hint: {
      fontFamily: fonts.family,
      fontSize: 12,
      color: colors.smoke,
      marginTop: -spacing.lg + 4,
      marginBottom: spacing.md,
    },
    forgotPasswordLink: {
      alignSelf: 'flex-end',
      marginTop: -spacing.sm,
      marginBottom: spacing.md,
    },
    forgotPasswordText: {
      fontFamily: fonts.family,
      fontSize: 13,
      fontWeight: '600',
      color: colors.emberText,
    },
    error: { color: colors.danger, marginBottom: spacing.md },
    info: { color: colors.sage, marginBottom: spacing.md },
    spinner: { marginTop: spacing.sm },
    primaryButton: {
      marginTop: spacing.sm,
      paddingVertical: 15,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.lg,
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
      color: colors.white,
      fontSize: 15.5,
      fontWeight: '700',
    },
    footer: {
      marginTop: spacing.xl,
      alignItems: 'center',
    },
    footerText: {
      fontFamily: fonts.family,
      fontSize: 13.5,
      color: colors.smoke,
    },
  });
