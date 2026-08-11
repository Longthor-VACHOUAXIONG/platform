import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Switch, Image, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import OsmMapView from '../components/OsmMapView';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { formatFare } from '../utils/format';
import { listenToOffers, cancelRide } from '../api/rideApi';
import { doc, updateDoc } from '@react-native-firebase/firestore';
import { db } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SearchingOffers'>;

const COUNTDOWN_SECONDS = 60;
const FARE_STEP = 1000;
const RAISE_STEP = 4500;

const CANCEL_REASON_KEYS = [
  { icon: 'walk-outline' as const, key: 'reasonDriversTooFar' },
  { icon: 'card-outline' as const, key: 'reasonHighFares' },
  { icon: 'alert-circle-outline' as const, key: 'reasonAccidental' },
  { icon: 'location-outline' as const, key: 'reasonWrongPoint' },
  { icon: 'reader-outline' as const, key: 'reasonNoOffers' },
  { icon: 'ellipsis-horizontal' as const, key: 'reasonOther' },
];

export default function SearchingOffersScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { rideId, fare: initialFare, rideTypeName, pickup, destination } = route.params;
  const [fare, setFare] = useState(initialFare);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [driversViewing, setDriversViewing] = useState(1);
  const [showRaisePrompt, setShowRaisePrompt] = useState(false);
  const [showCancelReasons, setShowCancelReasons] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Single countdown driver used by both the initial search and every
  // "raise fare" restart, so the behaviour stays consistent: tick down,
  // nudge the fake "drivers viewing" counter, and re-surface the raise-fare
  // prompt when time runs out.
  const startCountdown = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setShowRaisePrompt(true);
          return 0;
        }
        return s - 1;
      });
      setDriversViewing((d) => Math.min(14, d + 1));
    }, 1000);
  };

  useEffect(() => {
    startCountdown();

    // Navigate to the driver-picker as soon as at least one real offer lands.
    const unsubOffers = listenToOffers(rideId, (offers) => {
      if (offers.length > 0) {
        navigation.replace('ChooseDriver', { rideId });
      }
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      unsubOffers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a fare change back to the ride doc so drivers and the backend
  // see the new requested fare (the rider owns this doc, so a client-side
  // update is allowed by firestore.rules).
  const updateFare = (next: number) => {
    setFare(next);
    updateDoc(doc(db, 'rideRequests', rideId), { requestedFare: next }).catch((err) =>
      console.warn('Failed to persist raised fare', err)
    );
  };

  const raiseFare = () => {
    updateFare(fare + RAISE_STEP);
    setShowRaisePrompt(false);
    setSecondsLeft(COUNTDOWN_SECONDS);
    startCountdown();
  };

  const progress = secondsLeft / COUNTDOWN_SECONDS;

  return (
    <View style={styles.container}>
      <OsmMapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: 17.99, longitude: 102.64, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      />

      <SafeAreaView style={styles.topBar} edges={['top', 'left', 'right']}>
        <View style={styles.driversRow}>
          <Text style={styles.driversText}>
            {t('searching.driversViewing', { count: driversViewing })}
          </Text>
          <View style={styles.avatarStack}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={[styles.avatar, { marginLeft: i === 1 ? 0 : -10 }]} />
            ))}
          </View>
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.sheet} edges={['bottom', 'left', 'right']}>
        <View style={styles.grabber} />

        <View style={styles.timerRow}>
          <Text style={styles.timerLabel}>{t('searching.goodFarePriority')}</Text>
          <Text style={styles.timerValue}>0:{secondsLeft.toString().padStart(2, '0')}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.fareStepper}>
          <Pressable style={styles.stepperBtn} onPress={() => updateFare(Math.max(FARE_STEP, fare - FARE_STEP))}>
            <Text style={styles.stepperBtnText}>−1,000</Text>
          </Pressable>
          <Text style={styles.fareAmount}>{formatFare(fare)}</Text>
          <Pressable style={styles.stepperBtn} onPress={() => updateFare(fare + FARE_STEP)}>
            <Text style={styles.stepperBtnText}>+1,000</Text>
          </Pressable>
        </View>

        <Pressable style={styles.raiseButton} onPress={raiseFare}>
          <Text style={styles.raiseButtonText}>{t('searching.raiseFare')}</Text>
        </Pressable>

        <View style={styles.autoAcceptRow}>
          <Ionicons name="send" size={16} color={colors.black} />
          <Text style={styles.autoAcceptText}>
            {t('searching.autoAcceptNearest', { fare: formatFare(fare) })}
          </Text>
          <Switch value={false} />
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Ionicons name="cash-outline" size={16} color={colors.black} />
            <Text style={typography.bodyBold}>{formatFare(fare)} {t('common.cash')}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="person" size={16} color={colors.black} />
            <Text style={typography.body}>{pickup.label}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="flag" size={16} color={colors.black} />
            <Text style={typography.body}>{destination.label} ({rideTypeName})</Text>
          </View>
        </View>

        <Pressable style={styles.cancelButton} onPress={() => setShowCancelReasons(true)}>
          <Text style={typography.bodyBold}>{t('searching.cancelRequest')}</Text>
        </Pressable>
      </SafeAreaView>

      {/* Raise fare prompt — image 15/16 */}
      <Modal visible={showRaisePrompt} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setShowRaisePrompt(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.modalHeaderRow}>
            <Text style={typography.h3}>{t('searching.stillNeedARide')}</Text>
            <Pressable onPress={() => setShowRaisePrompt(false)}>
              <Ionicons name="close" size={22} color={colors.black} />
            </Pressable>
          </View>
          <Text style={styles.modalSubtext}>{t('searching.increaseChances')}</Text>

          <Pressable style={styles.searchAtButton} onPress={raiseFare}>
            <Text style={styles.raiseButtonText}>
              {t('searching.searchAt', { fare: formatFare(fare + RAISE_STEP) })}
            </Text>
          </Pressable>
          <Text style={styles.modalHint}>{t('searching.mostPassengersGetRide')}</Text>

          <Pressable style={styles.cancelButton} onPress={() => setShowCancelReasons(true)}>
            <Text style={typography.bodyBold}>{t('searching.iWantToCancel')}</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Cancel reasons — image 17 */}
      <Modal visible={showCancelReasons} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setShowCancelReasons(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.modalHeaderRow}>
            <Text style={typography.h3}>{t('searching.whyCancel')}</Text>
            <Pressable onPress={() => setShowCancelReasons(false)}>
              <Ionicons name="close" size={22} color={colors.black} />
            </Pressable>
          </View>

          {CANCEL_REASON_KEYS.map((r) => (
            <Pressable
              key={r.key}
              style={styles.reasonRow}
              onPress={async () => {
                try {
                  await cancelRide({ rideId, reason: t(`searching.${r.key}`) });
                  navigation.popToTop();
                } catch (err: any) {
                  Alert.alert(t('common.error'), err.message ?? t('common.pleaseTryAgain'));
                }
              }}
            >
              <Ionicons name={r.icon} size={20} color={colors.black} />
              <Text style={[typography.body, { flex: 1 }]}>{t(`searching.${r.key}`)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
            </Pressable>
          ))}

          <Pressable style={styles.skipButton} onPress={() => setShowCancelReasons(false)}>
            <Text style={typography.bodyBold}>{t('common.skip')}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.md },
  driversRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.sm, ...shadow.card },
  driversText: { ...typography.body, flex: 1 },
  avatarStack: { flexDirection: 'row' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gray200, borderWidth: 2, borderColor: colors.white },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md, ...shadow.card },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray200, alignSelf: 'center', marginBottom: spacing.sm },
  timerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timerLabel: { ...typography.bodyBold, flex: 1, marginRight: spacing.sm },
  timerValue: { ...typography.h3 },
  progressTrack: { height: 4, backgroundColor: colors.gray100, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.black },
  fareStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  stepperBtn: { backgroundColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  stepperBtnText: { ...typography.bodyBold, color: colors.gray600 },
  fareAmount: { ...typography.h2 },
  raiseButton: { backgroundColor: colors.gray100, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  raiseButtonText: { ...typography.bodyBold, color: colors.black },
  autoAcceptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  autoAcceptText: { ...typography.body, flex: 1 },
  summaryCard: { marginTop: spacing.md, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.sm },
  cancelButton: { backgroundColor: colors.gray100, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.md },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  modalSubtext: { ...typography.body, color: colors.gray600, marginTop: spacing.xs, marginBottom: spacing.md },
  searchAtButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  modalHint: { ...typography.caption, color: colors.gray600, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  skipButton: { backgroundColor: colors.gray100, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.md },
});
