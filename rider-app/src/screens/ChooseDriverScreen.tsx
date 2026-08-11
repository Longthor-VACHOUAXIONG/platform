import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, FlatList, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import OsmMapView from '../components/OsmMapView';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { formatFare } from '../utils/format';
import { listenToOffers, acceptOffer, cancelRide, type RideOffer } from '../api/rideApi';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ChooseDriver'>;

export default function ChooseDriverScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { rideId } = route.params;
  const [offers, setOffers] = useState<RideOffer[]>([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = listenToOffers(rideId, setOffers);
    return unsub;
  }, [rideId]);

  const decline = (driverId: string) => {
    // Declining locally just hides the card; the driver's offer document
    // stays 'pending' unless the rider accepts a different driver (which
    // marks all others 'declined_by_rider' server-side).
    setOffers((o) => o.filter((d) => d.driverId !== driverId));
  };

  const accept = async (offer: RideOffer) => {
    setAcceptingId(offer.driverId);
    try {
      await acceptOffer({ rideId, driverId: offer.driverId });
      navigation.navigate('TripInProgress', {
        rideId,
        driverName: offer.driverName,
        fare: offer.offeredFare,
      });
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <OsmMapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: 17.99, longitude: 102.64, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
      />

      <SafeAreaView style={styles.topBar} edges={['top', 'left', 'right']}>
        <Pressable style={styles.cancelPill} onPress={() => setShowCancelConfirm(true)}>
          <Ionicons name="close" size={16} color={colors.black} />
          <Text style={typography.bodyBold}>{t('searching.cancelRequest')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('chooseDriver.chooseADriver')}</Text>
        <View style={styles.verifiedRow}>
          <Ionicons name="shield-checkmark" size={16} color={colors.white} />
          <Text style={styles.verifiedText}>{t('chooseDriver.allDriversVerified')}</Text>
        </View>
      </SafeAreaView>

      <FlatList
        style={styles.list}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: 160, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
        data={offers}
        keyExtractor={(d) => d.driverId}
        ListEmptyComponent={
          <Text style={{ ...typography.body, color: colors.white, textAlign: 'center', marginTop: spacing.xl }}>
            {t('chooseDriver.waitingForOffers')}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.offerCard}>
            <View style={styles.offerHeader}>
              <Text style={styles.offerFare}>{formatFare(item.offeredFare)}</Text>
              <Text style={styles.offerEta}>{item.etaMinutes} {t('common.min')}</Text>
            </View>
            <View style={styles.driverRow}>
              <View style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={typography.bodyBold}>{item.driverName}</Text>
                  <Ionicons name="star" size={13} color={colors.black} />
                  <Text style={typography.caption}>{item.rating}</Text>
                  <Text style={[typography.caption, { color: colors.gray600 }]}>
                    {t('chooseDriver.ridesCount', { count: item.totalRides })}
                  </Text>
                </View>
                <Text style={typography.caption}>{item.vehicleModel}</Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.declineButton} onPress={() => decline(item.driverId)}>
                <Text style={typography.bodyBold}>{t('chooseDriver.decline')}</Text>
              </Pressable>
              <Pressable
                style={styles.acceptButton}
                disabled={acceptingId === item.driverId}
                onPress={() => accept(item)}
              >
                <Text style={styles.acceptText}>
                  {acceptingId === item.driverId ? t('chooseDriver.accepting') : t('chooseDriver.accept')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Modal visible={showCancelConfirm} transparent animationType="fade">
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmSheet}>
            <Text style={typography.h3}>{t('chooseDriver.cancelYourRequest')}</Text>
            <Text style={[typography.body, { color: colors.gray600, marginTop: spacing.xs, marginBottom: spacing.md }]}>
              {t('chooseDriver.betterOffersMayAppear')}
            </Text>
            <Pressable style={styles.keepSearchingButton} onPress={() => setShowCancelConfirm(false)}>
              <Text style={typography.bodyBold}>{t('chooseDriver.keepSearching')}</Text>
            </Pressable>
            <Pressable
              style={styles.confirmCancelButton}
              onPress={async () => {
                setShowCancelConfirm(false);
                try {
                  await cancelRide({ rideId, reason: t('chooseDriver.cancelledFromPicker') });
                  navigation.popToTop();
                } catch (err: any) {
                  Alert.alert(t('common.error'), err.message ?? t('common.pleaseTryAgain'));
                }
              }}
            >
              <Text style={[typography.bodyBold, { color: colors.danger }]}>{t('searching.cancelRequest')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.md, zIndex: 2 },
  cancelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F3D9D9',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  title: { ...typography.h1, color: colors.white, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  verifiedText: { color: colors.white, ...typography.body },
  list: { flex: 1 },
  offerCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, ...shadow.card },
  offerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm },
  offerFare: { ...typography.h2 },
  offerEta: { ...typography.h3, color: colors.gray600 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gray200 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  declineButton: { flex: 1, backgroundColor: colors.gray100, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  acceptButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  acceptText: { ...typography.bodyBold },
  confirmBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
  confirmSheet: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  keepSearchingButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginBottom: spacing.sm },
  confirmCancelButton: { backgroundColor: colors.gray100, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
});
