import { StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';

export const authStyles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.paper,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: colors.ink,
    marginBottom: 6,
  },
  subtitle: {
    color: colors.smoke,
    fontSize: 14.5,
    lineHeight: 20,
    marginBottom: 28,
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.smoke,
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
    borderRadius: radii.md,
    padding: 13,
    fontSize: 15,
    color: colors.ink,
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
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15.5,
    fontWeight: '700',
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13.5,
    color: colors.smoke,
  },
});