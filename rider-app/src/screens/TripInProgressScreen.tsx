import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import OsmMapView from '../components/OsmMapView';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { formatFare } from '../utils/format';
import { listenToRide } from '../api/rideApi';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TripInProgress'>;

export default function TripInProgressScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { rideId, driverName, fare } = route.params;
  const [status, setStatus] = useState<'driver_assigned' | 'in_progress' | 'completed'>('driver_assigned');

  useEffect(() => {
    const unsub = listenToRide(rideId, (ride: any) => {
      setStatus(ride.status);
      if (ride.status === 'completed') {
        navigation.replace('RateDriver', { rideId, driverName });
      }
    });
    return unsub;
  }, [rideId]);

  return (
    <View style={styles.container}>
      <OsmMapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: 17.99, longitude: 102.64, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      />

      <SafeAreaView style={styles.topBar}>
        <Pressable style={styles.chatButton} onPress={() => navigation.navigate('Chat', { rideId, otherPartyName: driverName })}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.black} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView style={styles.sheet}>
        <Text style={typography.h2}>
          {status === 'in_progress'
            ? t('tripInProgress.tripUnderway', { driverName })
            : t('tripInProgress.onTheWay', { driverName })}
        </Text>
        <Text style={[typography.body, { color: colors.gray600, marginTop: 4 }]}>
          {t('tripInProgress.fareLabel', { fare: formatFare(fare) })}
        </Text>
        <Text style={[typography.caption, { color: colors.gray400, marginTop: spacing.md }]}>
          {t('tripInProgress.waitingForDriver')}
        </Text>
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
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
});
