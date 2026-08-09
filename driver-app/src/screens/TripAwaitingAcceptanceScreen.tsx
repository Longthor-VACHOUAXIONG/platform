import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, Pressable } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';
import { useTranslation } from 'react-i18next';
import { listenToAssignedRide } from '../api/driverApi';
import { auth } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TripAwaitingAcceptance'>;

export default function TripAwaitingAcceptanceScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { rideId } = route.params;
  const [status, setStatus] = useState('offers_received');

  useEffect(() => {
    const unsub = listenToAssignedRide(rideId, (ride) => {
      setStatus(ride.status);
      if (ride.status === 'driver_assigned' && ride.assignedDriverId === auth.currentUser?.uid) {
        navigation.replace('TripInProgress', { rideId });
      }
      if (ride.status === 'cancelled') {
        navigation.replace('Home');
      }
    });
    return unsub;
  }, [rideId]);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color={colors.black} />
      <Text style={[typography.h3, { marginTop: spacing.lg, textAlign: 'center' }]}>
        {t('tripAwaiting.waitingForRider')}
      </Text>
      <Text style={[typography.body, { color: colors.gray600, marginTop: spacing.xs, textAlign: 'center' }]}>
        {t('tripAwaiting.autoUpdateNote')}
      </Text>
      <Pressable style={styles.cancelButton} onPress={() => navigation.replace('Home')}>
        <Text style={typography.bodyBold}>{t('tripAwaiting.backToRequests')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  cancelButton: { backgroundColor: colors.gray100, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.lg, marginTop: spacing.xl },
});
