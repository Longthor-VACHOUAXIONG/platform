import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, Switch, FlatList, Modal, TextInput, Alert } from 'react-native';
import OsmMapView, { Marker } from '../components/OsmMapView';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { formatFare } from '../utils/format';
import { updateDriverLocation, listenToOpenRequests, submitOffer } from '../api/driverApi';
import { setOnlineStatus, isInsufficientBalanceError, listenToWalletBalance, listenToWalletConfig, type WalletConfig, type InsufficientBalanceInfo } from '../api/walletApi';
import { setUpPushNotifications, listenForForegroundPush } from '../api/pushNotifications';
import { haversineKm } from '../utils/geohash';
import { auth } from '../api/firebaseConfig';
import LanguageSwitcherModal from '../components/LanguageSwitcherModal';
import type { OpenRideRequest } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const DEFAULT_REGION = { latitude: 17.9757, longitude: 102.6331, latitudeDelta: 0.03, longitudeDelta: 0.03 };

export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [online, setOnline] = useState(false);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [openRequests, setOpenRequests] = useState<OpenRideRequest[]>([]);
  const [offerTarget, setOfferTarget] = useState<OpenRideRequest | null>(null);
  const [offerAmount, setOfferAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletConfig, setWalletConfig] = useState<WalletConfig | null>(null);
  const [lowBalancePrompt, setLowBalancePrompt] = useState<InsufficientBalanceInfo | null>(null);
  const [togglingOnline, setTogglingOnline] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsubBalance = listenToWalletBalance(uid, setWalletBalance);
    const unsubConfig = listenToWalletConfig(setWalletConfig);
    return () => {
      unsubBalance();
      unsubConfig();
    };
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setRegion((r) => ({ ...r, latitude: loc.coords.latitude, longitude: loc.coords.longitude }));
    })();

    setUpPushNotifications().catch((err) => console.warn('Push setup failed', err));

    // While the app is in the foreground, FCM doesn't auto-surface a system
    // notification — refresh the open-requests list so a new nearby request
    // shows up immediately even before Firestore's own listener catches it.
    const unsubPush = listenForForegroundPush(() => {
      // The Firestore listener below already re-fetches on any change, so
      // there's nothing else to do here beyond letting the user know.
    });

    return unsubPush;
  }, []);

  const lastSubscribedLocation = React.useRef<{ lat: number; lng: number } | null>(null);
  // React tears down the previous effect's subscription before re-running
  // this effect on every region change, so the unsubscribe must live in a
  // ref — otherwise a tiny (<1km) GPS jitter would drop the live listener
  // and never re-subscribe.
  const openRequestsUnsub = React.useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!online) {
      setOpenRequests([]);
      lastSubscribedLocation.current = null;
      openRequestsUnsub.current?.();
      openRequestsUnsub.current = null;
      return;
    }

    const here = { lat: region.latitude, lng: region.longitude };
    const moved = lastSubscribedLocation.current
      ? haversineKm(lastSubscribedLocation.current, here)
      : Infinity;

    // Only re-subscribe once the driver has moved far enough that the
    // nearby geohash cells might have changed — avoids rebuilding the
    // Firestore listener on every tiny GPS jitter.
    if (moved < 1) return;

    lastSubscribedLocation.current = here;
    openRequestsUnsub.current?.();
    openRequestsUnsub.current = listenToOpenRequests(here, (rides) =>
      setOpenRequests(rides as OpenRideRequest[])
    );
    return () => {
      openRequestsUnsub.current?.();
      openRequestsUnsub.current = null;
    };
  }, [online, region.latitude, region.longitude]);

  const toggleOnline = async (value: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setTogglingOnline(true);
    try {
      await setOnlineStatus(value, value ? { lat: region.latitude, lng: region.longitude } : undefined);
      setOnline(value);
      if (value) {
        // Kick off a periodic location ping — in production use Location.watchPositionAsync
        // with background permissions so the pin stays live while the app is backgrounded.
        const loc = await Location.getCurrentPositionAsync({});
        await updateDriverLocation(uid, { lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    } catch (err) {
      if (isInsufficientBalanceError(err)) {
        setLowBalancePrompt(err.details as unknown as InsufficientBalanceInfo);
      } else {
        console.warn('Failed to change online status', err);
      }
      setOnline(false);
    } finally {
      setTogglingOnline(false);
    }
  };

  const openOfferModal = (ride: OpenRideRequest) => {
    setOfferTarget(ride);
    setOfferAmount(String(ride.requestedFare));
  };

  const sendOffer = async () => {
    if (!offerTarget) return;
    setSubmitting(true);
    try {
      await submitOffer({
        rideId: offerTarget.id,
        offeredFare: Number(offerAmount),
        etaMinutes: 4,
      });
      setOfferTarget(null);
      navigation.navigate('TripAwaitingAcceptance', { rideId: offerTarget.id });
    } catch (err: any) {
      Alert.alert(t('home.offerFailed'), err.message ?? t('common.pleaseTryAgain'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <OsmMapView style={StyleSheet.absoluteFill} region={region}>
        <Marker coordinate={region} color={online ? '#1E9E4B' : colors.gray400} />
      </OsmMapView>

      <SafeAreaView style={styles.topBar}>
        <View style={styles.statusRow}>
          <Text style={typography.bodyBold}>{online ? t('home.youreOnline') : t('home.youreOffline')}</Text>
          <Switch value={online} onValueChange={toggleOnline} disabled={togglingOnline} />
        </View>
        {walletBalance != null && walletConfig != null && (
          <Pressable
            style={[styles.walletChip, walletBalance < walletConfig.minimumBalance && styles.walletChipLow]}
            onPress={() => navigation.navigate('Wallet')}
          >
            <Ionicons name="wallet" size={16} color={walletBalance < walletConfig.minimumBalance ? colors.white : colors.black} />
            <Text
              style={[
                typography.bodyBold,
                { color: walletBalance < walletConfig.minimumBalance ? colors.white : colors.black },
              ]}
            >
              {formatFare(walletBalance, walletConfig.currency)}
            </Text>
          </Pressable>
        )}
        <View style={styles.buttonRow}>
          <Pressable style={styles.earningsButton} onPress={() => navigation.navigate('TripHistory')}>
            <Ionicons name="receipt-outline" size={18} color={colors.black} />
            <Text style={typography.bodyBold}>{t('home.earnings')}</Text>
          </Pressable>
          <Pressable style={styles.earningsButton} onPress={() => setLanguageOpen(true)}>
            <Ionicons name="language-outline" size={18} color={colors.black} />
          </Pressable>
        </View>
      </SafeAreaView>

      {online && (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('home.nearbyRequests')}</Text>
          {openRequests.length === 0 ? (
            <Text style={styles.emptyText}>{t('home.waitingForRequests')}</Text>
          ) : (
            <FlatList
              data={openRequests}
              keyExtractor={(r) => r.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <Pressable style={styles.requestCard} onPress={() => openOfferModal(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodyBold} numberOfLines={1}>
                      {item.pickup.label} → {item.destination.label}
                    </Text>
                    <Text style={styles.requestMeta}>{item.rideTypeId}</Text>
                  </View>
                  <Text style={typography.h3}>{formatFare(item.requestedFare, item.currency)}</Text>
                </Pressable>
              )}
            />
          )}
        </View>
      )}

      <Modal visible={!!offerTarget} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setOfferTarget(null)} />
        <View style={styles.modalSheet}>
          <Text style={typography.h3}>{t('home.makeAnOffer')}</Text>
          {offerTarget && (
            <Text style={[typography.body, { color: colors.gray600, marginTop: 4, marginBottom: spacing.md }]}>
              {offerTarget.pickup.label} → {offerTarget.destination.label}
            </Text>
          )}
          <TextInput
            style={styles.offerInput}
            keyboardType="number-pad"
            value={offerAmount}
            onChangeText={setOfferAmount}
          />
          <Pressable style={styles.submitButton} disabled={submitting} onPress={sendOffer}>
            <Text style={typography.bodyBold}>{submitting ? t('home.sending') : t('home.sendOffer')}</Text>
          </Pressable>
        </View>
      </Modal>

      <LanguageSwitcherModal visible={languageOpen} onClose={() => setLanguageOpen(false)} />

      <Modal visible={!!lowBalancePrompt} transparent animationType="fade">
        <View style={styles.lowBalanceBackdrop}>
          <View style={styles.lowBalanceSheet}>
            <Ionicons name="wallet" size={36} color={colors.danger} style={{ marginBottom: spacing.sm }} />
            <Text style={typography.h3}>Top up to go online</Text>
            {lowBalancePrompt && walletConfig && (
              <Text style={[typography.body, { color: colors.gray600, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md }]}>
                Your balance is {formatFare(lowBalancePrompt.balance, walletConfig.currency)}, below the{' '}
                {formatFare(lowBalancePrompt.minimumBalance, walletConfig.currency)} minimum. Top up at least{' '}
                {formatFare(lowBalancePrompt.shortfall, walletConfig.currency)} to start receiving requests.
              </Text>
            )}
            <Pressable
              style={styles.submitButton}
              onPress={() => {
                setLowBalancePrompt(null);
                navigation.navigate('TopUp');
              }}
            >
              <Text style={typography.bodyBold}>Top up now</Text>
            </Pressable>
            <Pressable style={{ paddingVertical: spacing.md }} onPress={() => setLowBalancePrompt(null)}>
              <Text style={[typography.body, { color: colors.gray600 }]}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    ...shadow.card,
  },
  walletChipLow: { backgroundColor: colors.danger },
  lowBalanceBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  lowBalanceSheet: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', width: '100%' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.md },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  earningsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  sheetTitle: { ...typography.h3, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.gray600, paddingVertical: spacing.lg, textAlign: 'center' },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  requestMeta: { ...typography.caption, color: colors.gray600, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  offerInput: { backgroundColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, fontSize: 24, fontWeight: '700', marginBottom: spacing.md },
  submitButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
});
