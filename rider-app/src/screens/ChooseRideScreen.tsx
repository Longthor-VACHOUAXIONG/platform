import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Switch,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import OsmMapView, { Marker, Polyline } from '../components/OsmMapView';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { rideTypes } from '../data/mock';
import { formatFare } from '../utils/format';
import { haversineKm } from '../utils/fare';
import { getDrivingRoute, type LatLng } from '../utils/directions';
import { createRideRequest, getRecommendedFare } from '../api/rideApi';
import { doc, getDoc } from '@react-native-firebase/firestore';
import { auth, db } from '../api/firebaseConfig';
import FareSlider from '../components/FareSlider';
import type { RideType } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ChooseRide'>;

const STEP = 500;
const ZONE_ID = 'Vientiane';

const RIDE_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  car: 'car',
  'car-electric': 'car-electric',
  motorbike: 'moped',
  package: 'package-variant',
  'car-comfort': 'car-sports',
};

type ServerFare = { fare: number; currency: string; minimumFare: number };

export default function ChooseRideScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rideTypeLabel = (id: string) => t(`chooseRide.${id}Name`);

  const { pickup, destination, initialRideTypeId } = route.params;

  // Straight-line distance shown instantly while the real road route loads
  // in the background — same pattern inDrive/Uber use so the screen never
  // feels stuck waiting on a network call.
  const straightLineKm = useMemo(() => haversineKm(pickup, destination), [pickup, destination]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [routePolyline, setRoutePolyline] = useState<LatLng[]>([]);
  const [routeLoading, setRouteLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRouteLoading(true);
    getDrivingRoute(pickup, destination).then((result) => {
      if (cancelled) return;
      if (result) {
        setRouteDistanceKm(result.distanceKm);
        setRouteDurationMin(result.durationMin);
        setRoutePolyline(result.polyline);
      }
      setRouteLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pickup, destination]);

  const distanceKm = routeDistanceKm ?? straightLineKm * 1.3;
  const etaLabel = routeDurationMin
    ? `${routeDurationMin} ${t('common.min')}.`
    : `${Math.max(1, Math.round((distanceKm / 30) * 60))} ${t('common.min')}.`;

  const [selected, setSelected] = useState<RideType>(
    () => rideTypes.find((rt) => rt.id === initialRideTypeId) ?? rideTypes[0]
  );
  // Recommended fares come from the backend callable, which reads the admin's
  // pricingConfig (km × per-km rate). Offline fallback keeps the UI alive.
  const [serverFares, setServerFares] = useState<Record<string, ServerFare>>({});
  const [fare, setFare] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [extraPassengers, setExtraPassengers] = useState(false);
  const [childSeat, setChildSeat] = useState(false);
  const [comment, setComment] = useState('');
  const [autoAccept, setAutoAccept] = useState(false);
  const [creating, setCreating] = useState(false);
  const [riderName, setRiderName] = useState('Rider');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (snap.exists() && snap.data()?.name) setRiderName(snap.data()!.name);
      })
      .catch(() => {});
  }, []);

  // Ask the backend for the recommended fare of every ride type once we have
  // a real road distance. Server fares win; client fallback only if offline.
  useEffect(() => {
    let cancelled = false;
    if (!distanceKm) return;
    (async () => {
      const entries = await Promise.all(
        rideTypes.map(async (rt) => {
          try {
            const res = await getRecommendedFare({
              pickup: { lat: pickup.lat, lng: pickup.lng },
              destination: { lat: destination.lat, lng: destination.lng },
              rideTypeId: rt.id,
              zoneId: ZONE_ID,
            });
            return [rt.id, res.data] as const;
          } catch {
            return [rt.id, null] as const;
          }
        })
      );
      if (cancelled) return;
      const next: Record<string, ServerFare> = {};
      entries.forEach(([id, data]) => {
        next[id] = data ?? { fare: 0, currency: 'LAK', minimumFare: 10000 };
      });
      setServerFares(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [routeDistanceKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // The selected ride's fare = server recommended fare once it arrives,
  // otherwise the local fallback estimate. Switching ride type resets to the
  // recommendation for that type.
  const minFareFor = (rt: RideType) => serverFares[rt.id]?.minimumFare ?? 10000;
  const fareFor = (rt: RideType) =>
    serverFares[rt.id]?.fare || estimateFallback(distanceKm, rt.id);

  useEffect(() => {
    setFare(fareFor(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id, serverFares, routeDistanceKm]);

  function estimateFallback(distanceKm: number, rideTypeId: string): number {
    const rate: Record<string, number> = { ride: 3000, electro: 3800, moto: 1800, comfort: 3500, courier: 4000 };
    return Math.max(10000, Math.round((distanceKm * (rate[rideTypeId] ?? 3000)) / 500) * 500);
  }

  const selectRide = (rt: RideType) => {
    setSelected(rt);
    setFare(fareFor(rt));
  };

  const minFare = minFareFor(selected);
  const recommended = fareFor(selected);
  // Mirror the backend's acceptance band so the slider can't offer a price
  // that requestRide/updateRequestedFare would reject.
  const maxAllowed = Math.max(minFare * 2, Math.round((recommended * 2.5) / 500) * 500);

  return (
    <View style={styles.container}>
      <OsmMapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: (pickup.lat + destination.lat) / 2,
          longitude: (pickup.lng + destination.lng) / 2,
          latitudeDelta: Math.max(0.02, Math.abs(pickup.lat - destination.lat) * 2),
          longitudeDelta: Math.max(0.02, Math.abs(pickup.lng - destination.lng) * 2),
        }}
      >
        <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} />
        <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} color={colors.black} />
        {routePolyline.length > 0 && (
          <Polyline coordinates={routePolyline} strokeColor={colors.black} strokeWidth={4} />
        )}
      </OsmMapView>

      {routeLoading && (
        <View style={styles.routeLoadingPill}>
          <ActivityIndicator size="small" color={colors.black} />
          <Text style={styles.routeLoadingText}>{t('chooseRide.calculatingRoute')}</Text>
        </View>
      )}

      <SafeAreaView style={styles.topBar} edges={['top', 'left', 'right']}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.black} />
        </Pressable>

        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <Ionicons name="person" size={16} color={colors.black} />
            <Text style={styles.routeText} numberOfLines={1}>{pickup.label}</Text>
          </View>
          <View style={styles.routeRow}>
            <Ionicons name="flag" size={16} color={colors.black} />
            <Text style={styles.routeText} numberOfLines={1}>{destination.label} · ~{etaLabel}</Text>
          </View>
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.sheet} edges={['bottom', 'left', 'right']}>
        <View style={styles.grabber} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsRow}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {rideTypes.map((rt) => {
            const active = rt.id === selected.id;
            return (
              <Pressable
                key={rt.id}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => selectRide(rt)}
              >
                <MaterialCommunityIcons name={RIDE_ICONS[rt.icon]} size={20} color={active ? colors.white : colors.black} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{rideTypeLabel(rt.id)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.pricingCard}>
          <View style={styles.fareHeaderRow}>
            <View>
              <Text style={styles.fareCaption}>{t('chooseRide.setYourFare')}</Text>
              <Text style={styles.fareAmount}>{fare ? formatFare(fare) : '…'}</Text>
            </View>
            <View style={styles.fareSubRow}>
              <Text style={styles.fareHint}>{t('chooseRide.recommendedFare')}</Text>
              <Text style={styles.fareHintValue}>{formatFare(Math.round(recommended))}</Text>
            </View>
          </View>

          <FareSlider
            value={fare || minFare}
            minimumValue={minFare}
            maximumValue={maxAllowed}
            step={STEP}
            onValueChange={setFare}
          />

          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>{formatFare(minFare)}</Text>
            <Text style={styles.sliderLabel}>{t('chooseRide.yourPrice')}</Text>
            <Text style={styles.sliderLabel}>{formatFare(maxAllowed)}</Text>
          </View>
        </View>

        <Pressable style={styles.optionsRow} onPress={() => setOptionsOpen(true)}>
          <Ionicons name="people-outline" size={18} color={colors.black} />
          <Text style={styles.optionsText}>{t('chooseRide.passengersOptions')}</Text>
          {(extraPassengers || childSeat || comment) && (
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          )}
          <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
        </Pressable>

        <View style={styles.autoAcceptRow}>
          <Ionicons name="send" size={16} color={colors.primary} />
          <Text style={styles.autoAcceptText}>{t('chooseRide.autoAcceptOffer', { fare: formatFare(fare) })}</Text>
          <Switch value={autoAccept} onValueChange={setAutoAccept} />
        </View>

        <Pressable
          style={styles.findButton}
          disabled={creating}
          onPress={async () => {
            const uid = auth.currentUser?.uid;
            if (!uid) {
              Alert.alert(t('chooseRide.pleaseSignInFirst'));
              return;
            }
            if (!fare) {
              Alert.alert(t('chooseRide.couldNotRequestRide'), t('chooseRide.calculatingRoute'));
              return;
            }
            setCreating(true);
            try {
              const rideId = await createRideRequest({
                riderId: uid,
                riderName,
                pickup,
                destination,
                rideTypeId: selected.id,
                requestedFare: fare,
                extraPassengers,
                childSeat,
                comment: comment || undefined,
                zoneId: ZONE_ID,
              });
              navigation.navigate('SearchingOffers', {
                rideId,
                fare,
                rideTypeName: rideTypeLabel(selected.id),
                pickup,
                destination,
                minimumFare: minFareFor(selected),
                autoAccept,
              });
            } catch (err: any) {
              Alert.alert(t('chooseRide.couldNotRequestRide'), err.message ?? t('common.pleaseTryAgain'));
            } finally {
              setCreating(false);
            }
          }}
        >
          {creating ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.findButtonText}>{t('chooseRide.findOffers')}</Text>
          )}
        </Pressable>
      </SafeAreaView>

      <Modal visible={optionsOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setOptionsOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Text style={typography.h3}>{t('chooseRide.options')}</Text>
            <Pressable onPress={() => setOptionsOpen(false)}>
              <Ionicons name="close" size={22} color={colors.black} />
            </Pressable>
          </View>

          <View style={styles.modalRow}>
            <Text style={typography.body}>{t('chooseRide.moreThan4Passengers')}</Text>
            <Switch value={extraPassengers} onValueChange={setExtraPassengers} />
          </View>
          <View style={styles.modalRow}>
            <Text style={typography.body}>{t('chooseRide.childSafetySeat')}</Text>
            <Switch value={childSeat} onValueChange={setChildSeat} />
          </View>

          <TextInput
            style={styles.commentInput}
            placeholder={t('chooseRide.comments')}
            value={comment}
            onChangeText={setComment}
          />

          <Pressable style={styles.closeButton} onPress={() => setOptionsOpen(false)}>
            <Text style={[typography.bodyBold, { color: colors.white }]}>{t('common.close')}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  routeLoadingPill: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    ...shadow.card,
  },
  routeLoadingText: { ...typography.caption },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.md, gap: spacing.sm },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  routeCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: 8, ...shadow.card },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeText: { ...typography.bodyBold, flex: 1 },
  routeBadge: { backgroundColor: colors.gray100, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  routeBadgeText: { ...typography.caption },
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
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray200, alignSelf: 'center', marginBottom: spacing.sm },
  tabsRow: { flexGrow: 0, marginBottom: spacing.md },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.gray50,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { ...typography.bodyBold },
  tabLabelActive: { color: colors.white },
  pricingCard: { backgroundColor: colors.gray50, borderRadius: radius.lg, padding: spacing.md },
  fareHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.xs },
  fareSubRow: { alignItems: 'flex-end' },
  fareHint: { ...typography.caption, color: colors.gray600 },
  fareHintValue: { ...typography.bodyBold, marginTop: 2 },
  fareAmount: { ...typography.h1, marginTop: 2 },
  fareCaption: { ...typography.caption, color: colors.gray600 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  sliderLabel: { ...typography.caption, color: colors.gray600 },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  optionsText: { ...typography.body, flex: 1 },
  autoAcceptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  autoAcceptText: { ...typography.body, flex: 1 },
  findButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 18, alignItems: 'center', marginTop: spacing.sm },
  findButtonText: { ...typography.h3, color: colors.white },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  commentInput: { backgroundColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.md },
  closeButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
});
