import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '../theme/theme';
import { submitRating } from '../api/driverApi';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'RateRider'>;

export default function RateRiderScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { rideId } = route.params;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await submitRating({ rideId, rating, comment: comment || undefined });
    } finally {
      navigation.replace('Home');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={typography.h1}>{t('rating.rateYourRider')}</Text>
        <Text style={[typography.body, { color: colors.gray600, marginTop: 4, marginBottom: spacing.xl }]}>
          {t('rating.howWasThisTrip')}
        </Text>

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} hitSlop={8}>
              <Ionicons
                name={n <= rating ? 'star' : 'star-outline'}
                size={44}
                color={n <= rating ? colors.primaryDark : colors.gray200}
              />
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.commentInput}
          placeholder={t('rating.commentPlaceholder')}
          placeholderTextColor={colors.gray400}
          value={comment}
          onChangeText={setComment}
          multiline
        />

        <Pressable
          style={[styles.submitButton, rating === 0 && { opacity: 0.5 }]}
          disabled={rating === 0 || submitting}
          onPress={submit}
        >
          {submitting ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('common.submit')}</Text>}
        </Pressable>

        <Pressable style={styles.skipButton} onPress={() => navigation.replace('Home')}>
          <Text style={[typography.body, { color: colors.gray600 }]}>{t('common.skip')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  commentInput: {
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
    ...typography.body,
  },
  submitButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  skipButton: { alignItems: 'center', paddingVertical: spacing.md },
});
