import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Modal,
  Switch,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import OsmMapView, { Marker, Polyline } from '../components/OsmMapView';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { rideTypes } from '../data/mock';
import { formatFare } from '../utils/format';
import { estimateFareForDistance, haversineKm } from '../utils/fare';
import { getDrivingRoute, type LatLng } from '../utils/directions';
import { createRideRequest } from '../api/rideApi';
import { auth } from '../api/firebaseConfig';
import type { RideType } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ChooseRide'>;

const STEP = 1000;

const RIDE_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  car: 'car',
  'car-electric': 'car-electric',
  motorbike: 'moped',
  package: 'package-variant',
  'car-comfort': 'car-sports',
};

export default function ChooseRideScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const rideTypeLabel = (id: string) => t(`chooseRide.${id}Name`);
  const rideTypeDesc = (id: string) => t(`chooseRide.${id}Desc`);

  const { pickup, destination } = route.params;

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

  // Use the real road distance once it's back; fall back to straight-line
  // (times a small padding factor, since roads are never perfectly direct)
  // if the Directions API call fails for any reason.
  const distanceKm = routeDistanceKm ?? straightLineKm * 1.3;
  const etaLabel = routeDurationMin
    ? `${routeDurationMin} ${t('common.min')}.`
    : `${Math.max(1, Math.round((distanceKm / 30) * 60))} ${t('common.min')}.`;

  const [selected, setSelected] = useState<RideType>(rideTypes[0]);
  const [fare, setFare] = useState(() => estimateFareForDistance(distanceKm, rideTypes[0].id));
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [extraPassengers, setExtraPassengers] = useState(false);
  const [childSeat, setChildSeat] = useState(false);
  const [comment, setComment] = useState('');
  const [creating, setCreating] = useState(false);

  // Recompute the fare once the real route distance comes back.
  useEffect(() => {
    if (selected.id !== 'courier') {
      setFare(estimateFareForDistance(distanceKm, selected.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDistanceKm]);

  const selectRide = (rt: RideType) => {
    setSelected(rt);
    if (rt.id !== 'courier') setFare(estimateFareForDistance(distanceKm, rt.id));
  };

  const canAdjustFare = selected.id !== 'courier';

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

      <SafeAreaView style={styles.topBar}>
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

      <View style={styles.sheet}>
        <View style={styles.grabber} />

        <View style={styles.rideCard}>
          <View style={styles.rideRow}>
            <MaterialCommunityIcons name={RIDE_ICONS[selected.icon]} size={36} color={colors.black} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={typography.h3}>{rideTypeLabel(selected.id)}</Text>
                <Ionicons name="information-circle-outline" size={16} color={colors.gray600} />
              </View>
              <Text style={styles.rideMeta}>
                {selected.capacity ? `${selected.capacity} · ${selected.etaMinutes} ${t('common.min')}` : ''}
              </Text>
              <Text style={styles.rideDesc}>{rideTypeDesc(selected.id)}</Text>
            </View>
            <Pressable onPress={() => setOptionsOpen(true)}>
              <Ionicons name="pencil" size={18} color={colors.black} />
            </Pressable>
          </View>

          {canAdjustFare && (
            <View style={styles.fareStepper}>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setFare((f) => Math.max(STEP, f - STEP))}
              >
                <Text style={styles.stepperBtnText}>−</Text>
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.fareAmount}>{formatFare(fare)}</Text>
                <Text style={styles.fareCaption}>{t('chooseRide.recommendedFare')}</Text>
              </View>
              <Pressable style={styles.stepperBtn} onPress={() => setFare((f) => f + STEP)}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          )}
        </View>

        <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
          {rideTypes
            .filter((rt) => rt.id !== selected.id)
            .map((rt) => (
              <Pressable key={rt.id} style={styles.optionRow} onPress={() => selectRide(rt)}>
                <MaterialCommunityIcons name={RIDE_ICONS[rt.icon]} size={30} color={colors.black} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.bodyBold}>{rideTypeLabel(rt.id)}</Text>
                  <Text style={styles.optionMeta}>
                    {rt.capacity ? `${rt.capacity} · ${rt.etaMinutes} ${t('common.min')}` : rideTypeDesc(rt.id)}
                  </Text>
                  <Text style={styles.optionDesc}>{rideTypeDesc(rt.id)}</Text>
                </View>
                {rt.id !== 'courier' ? (
                  <Text style={typography.bodyBold}>~{formatFare(estimateFareForDistance(distanceKm, rt.id))}</Text>
                ) : null}
              </Pressable>
            ))}
        </ScrollView>

        <View style={styles.autoAcceptRow}>
          <Ionicons name="send" size={16} color={colors.black} />
          <Text style={styles.autoAcceptText}>{t('chooseRide.autoAcceptOffer', { fare: formatFare(fare) })}</Text>
          <Switch value={false} />
        </View>

        <View style={styles.ctaRow}>
          <View style={styles.cashPill}>
            <Ionicons name="cash-outline" size={18} color={colors.black} />
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
              setCreating(true);
              try {
                const rideId = await createRideRequest({
                  riderId: uid,
                  riderName: 'Rider',
                  pickup,
                  destination,
                  rideTypeId: selected.id,
                  requestedFare: fare,
                });
                navigation.navigate('SearchingOffers', {
                  rideId,
                  fare,
                  rideTypeName: rideTypeLabel(selected.id),
                  pickup,
                  destination,
                });
              } catch (err: any) {
                Alert.alert(t('chooseRide.couldNotRequestRide'), err.message ?? t('onboarding.pleaseTryAgain'));
              } finally {
                setCreating(false);
              }
            }}
          >
            {creating ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.findButtonText}>{t('chooseRide.findOffers')}</Text>
            )}
          </Pressable>
          <Pressable style={styles.filterPill}>
            <Ionicons name="options-outline" size={18} color={colors.black} />
          </Pressable>
        </View>
      </View>

      <Modal visible={optionsOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setOptionsOpen(false)} />
        <View style={styles.modalSheet}>
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
            <Text style={typography.bodyBold}>{t('common.close')}</Text>
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
  rideCard: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rideMeta: { ...typography.caption, color: colors.gray600 },
  rideDesc: { ...typography.caption, color: colors.gray600 },
  fareStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  stepperBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gray200, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 22, fontWeight: '700' },
  fareAmount: { ...typography.h2 },
  fareCaption: { ...typography.caption, color: colors.gray600 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  optionMeta: { ...typography.caption, color: colors.gray600 },
  optionDesc: { ...typography.caption, color: colors.gray400 },
  autoAcceptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  autoAcceptText: { ...typography.body, flex: 1 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  cashPill: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  findButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  findButtonText: { ...typography.h3 },
  filterPill: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  commentInput: { backgroundColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.md },
  closeButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
});
