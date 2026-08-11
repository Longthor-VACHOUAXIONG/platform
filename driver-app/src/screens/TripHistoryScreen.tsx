import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { formatFare } from '../utils/format';
import { fetchTripHistory } from '../api/driverApi';
import { auth } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TripHistory'>;

type Trip = {
  id: string;
  riderName: string;
  pickup: { label: string };
  destination: { label: string };
  assignedFare: number | null;
  currency: string;
  createdAt: { toDate: () => Date } | null;
};

export default function TripHistoryScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    fetchTripHistory(uid)
      .then((rides) => setTrips(rides as Trip[]))
      .finally(() => setLoading(false));
  }, []);

  const totalEarnings = trips.reduce((sum, trip) => sum + (trip.assignedFare ?? 0), 0);
  const currency = trips[0]?.currency ?? 'LAK';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.black} />
        </Pressable>
        <Text style={typography.h2}>{t('tripHistory.title')}</Text>
        <View style={{ width: 22 }} />
      </View>

      {!loading && (
        <View style={styles.summaryCard}>
          <Text style={typography.caption}>{t('tripHistory.totalFromTrips', { count: trips.length })}</Text>
          <Text style={typography.h1}>{formatFare(totalEarnings, currency)}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.black} />
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={
            <Text style={[typography.body, { color: colors.gray600, textAlign: 'center', marginTop: spacing.xl }]}>
              {t('tripHistory.empty')}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.tripCard}>
              <Text style={typography.bodyBold}>{item.riderName}</Text>
              <View style={styles.tripRow}>
                <Ionicons name="person" size={14} color={colors.gray600} />
                <Text style={typography.body} numberOfLines={1}>{item.pickup?.label}</Text>
              </View>
              <View style={styles.tripRow}>
                <Ionicons name="flag" size={14} color={colors.gray600} />
                <Text style={typography.body} numberOfLines={1}>{item.destination?.label}</Text>
              </View>
              <View style={styles.tripFooter}>
                <Text style={typography.caption}>
                  {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ''}
                </Text>
                <Text style={typography.bodyBold}>{formatFare(item.assignedFare ?? 0, item.currency)}</Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  tripCard: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, gap: 6, ...shadow.card },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
});
