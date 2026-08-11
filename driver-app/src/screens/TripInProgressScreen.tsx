import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OsmMapView from '../components/OsmMapView';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { useTranslation } from 'react-i18next';
import { formatFare } from '../utils/format';
import { listenToAssignedRide, startTrip, completeTrip } from '../api/driverApi';
import type { AssignedRide } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TripInProgress'>;

export default function TripInProgressScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { rideId } = route.params;
  const [ride, setRide] = useState<AssignedRide | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = listenToAssignedRide(rideId, (data) => setRide(data as unknown as AssignedRide));
    return unsub;
  }, [rideId]);

  const onStart = async () => {
    setBusy(true);
    try {
      await startTrip({ rideId });
    } catch (err: any) {
      Alert.alert(t('tripInProgress.startFailed'), err.message ?? t('common.pleaseTryAgain'));
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    setBusy(true);
    try {
      await completeTrip({ rideId });
      navigation.replace('RateRider', { rideId });
    } catch (err: any) {
      Alert.alert(t('tripInProgress.completeFailed'), err.message ?? t('common.pleaseTryAgain'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <OsmMapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: 17.98, longitude: 102.63, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      />

      <SafeAreaView style={styles.topBar} edges={['top']}>
        <Pressable
          style={styles.chatButton}
          onPress={() => navigation.navigate('Chat', { rideId, otherPartyName: ride?.riderName ?? t('tripInProgress.riderFallback') })}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.black} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView style={styles.sheet} edges={['bottom', 'left', 'right']}>
        <Text style={typography.h2}>{ride?.riderName ?? t('tripInProgress.riderFallback')}</Text>
        <Text style={[typography.body, { color: colors.gray600, marginTop: 4 }]}>
          {ride ? formatFare(ride.assignedFare) : ''} · {t('common.cash')}
        </Text>

        <View style={styles.routeCard}>
          <Text style={typography.body}>{t('tripInProgress.pickupLabel', { label: ride?.pickup.label ?? '' })}</Text>
          <Text style={typography.body}>{t('tripInProgress.dropoffLabel', { label: ride?.destination.label ?? '' })}</Text>
        </View>

        {ride?.status === 'driver_assigned' && (
          <Pressable style={styles.actionButton} disabled={busy} onPress={onStart}>
            <Text style={typography.bodyBold}>{busy ? t('tripInProgress.starting') : t('tripInProgress.startTrip')}</Text>
          </Pressable>
        )}
        {ride?.status === 'in_progress' && (
          <Pressable style={styles.actionButton} disabled={busy} onPress={onComplete}>
            <Text style={typography.bodyBold}>{busy ? t('tripInProgress.completing') : t('tripInProgress.completeTrip')}</Text>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { position: 'absolute', top: 0, right: 0, padding: spacing.md },
  chatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, ...shadow.card },
  routeCard: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, gap: 6, marginTop: spacing.md },
  actionButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg },
});
