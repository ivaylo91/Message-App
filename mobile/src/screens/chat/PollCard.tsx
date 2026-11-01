import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { Touchable } from '../../components/Touchable';
import { tallyPoll } from '../../polls/polls';
import { useTheme } from '../../theme/ThemeContext';
import { fonts, fontSizes, radii, spacing, ThemeColors } from '../../theme/tokens';
import { PollVote } from '../../types';

interface PollCardProps {
  options: string[];
  votes: PollVote[];
  userId: string | null;
  isMine: boolean;
  disabled: boolean;
  onVote: (optionIndex: number) => void;
  onLongPress: () => void;
}

// The choices under a poll's question, which the bubble draws as its body.
// Counts show from the start, as they do in a group chat asked out loud.
export function PollCard({
  options,
  votes,
  userId,
  isMine,
  disabled,
  onVote,
  onLongPress,
}: PollCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { counts, total, myChoice } = useMemo(
    () => tallyPoll(options.length, votes, userId),
    [options.length, votes, userId],
  );

  return (
    <View style={styles.card}>
      {options.map((option, index) => {
        const count = counts[index];
        const isChosen = myChoice === index;
        const share = total > 0 ? count / total : 0;
        return (
          <Touchable
            key={index}
            style={[styles.option, isMine ? styles.optionMine : styles.optionTheirs]}
            onPress={() => onVote(index)}
            onLongPress={onLongPress}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: isChosen, disabled }}
            accessibilityLabel={`${option}, ${t('polls.votes', { count })}`}
          >
            <View
              style={[
                styles.fill,
                isMine ? styles.fillMine : styles.fillTheirs,
                { width: `${Math.round(share * 100)}%` },
              ]}
            />
            {isChosen && (
              <Icon name="check" size={15} color={isMine ? colors.white : colors.emberText} />
            )}
            <Text
              style={[styles.optionText, isMine ? styles.textMine : styles.textTheirs]}
              numberOfLines={2}
            >
              {option}
            </Text>
            <Text style={[styles.count, isMine ? styles.textMine : styles.textTheirs]}>{count}</Text>
          </Touchable>
        );
      })}
      <Text style={[styles.total, isMine ? styles.textMine : styles.textTheirs]}>
        {t('polls.votes', { count: total })}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: { alignSelf: 'stretch', minWidth: 230, marginTop: spacing.sm, gap: spacing.xs },
    option: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      overflow: 'hidden',
      borderRadius: radii.md,
    },
    optionMine: { backgroundColor: 'rgba(255,255,255,0.16)' },
    optionTheirs: { backgroundColor: colors.paper },
    fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
    fillMine: { backgroundColor: 'rgba(255,255,255,0.28)' },
    fillTheirs: { backgroundColor: colors.line },
    optionText: { flex: 1, fontFamily: fonts.family, fontSize: 15, lineHeight: 20, fontWeight: '500' },
    count: { fontFamily: fonts.family, fontSize: fontSizes.footnote, fontWeight: '700' },
    total: { fontFamily: fonts.family, fontSize: fontSizes.caption, marginTop: 2, opacity: 0.8 },
    textMine: { color: colors.white },
    textTheirs: { color: colors.ink },
  });
