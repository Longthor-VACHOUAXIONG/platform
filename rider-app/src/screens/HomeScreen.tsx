import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OsmMapView, { Marker } from '../components/OsmMapView';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { reverseGeocodeLabel } from '../utils/geocode';
import { rideTypes } from '../data/mock';
import MainMenuModal from '../components/MainMenuModal';
import { setUpPushNotifications, listenForForegroundPush } from '../api/pushNotifications';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const DEFAULT_REGION = {
  latitude: 17.9757,
  longitude: 102.6331, // Vientiane, as a sensible default — swap per your market
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const SERVICE_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  car: 'car',
  motorbike: 'moped',
  package: 'package-variant',
  'car-comfort': 'car-sports',
  'car-electric': 'car-electric',
};

export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [pickupLabel, setPickupLabel] = useState('');
  const [locatingLabel, setLocatingLabel] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [service, setService] = useState<string>('ride');

  useEffect(() => {
    // Register for FCM so riders get chat/trip push notifications even when
    // the app is backgrounded (token saved via registerRiderPushToken).
    setUpPushNotifications().catch((err) => console.warn('Push setup failed', err));

    // Foreground: FCM doesn't auto-show a system notification, so surface
    // chat/trip updates with an in-app alert.
    const unsubPush = listenForForegroundPush();
    return unsubPush;
  }, []);

  const locate = async () => {
    setLocatingLabel(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocatingLabel(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const next = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setRegion((r) => ({ ...r, ...next }));
      const label = await reverseGeocodeLabel(next.latitude, next.longitude);
      setPickupLabel(label);
    } catch (err) {
      console.warn('Failed to locate rider', err);
    } finally {
      setLocatingLabel(false);
    }
  };

  useEffect(() => {
    locate();
  }, []);

  const pickupParam = { label: pickupLabel, lat: region.latitude, lng: region.longitude };

  return (
    <View style={styles.container}>
      <OsmMapView style={StyleSheet.absoluteFill} initialRegion={DEFAULT_REGION} region={region}>
        <Marker coordinate={region} />
      </OsmMapView>

      <SafeAreaView style={styles.topArea} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.menuRow}>
          <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)}>
            <Ionicons name="menu" size={22} color={colors.black} />
          </Pressable>
        </View>

        <View style={styles.addressCard}>
          <Pressable style={styles.addressRow} onPress={locate}>
            <View style={[styles.addressDot, { backgroundColor: colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addressLabel}>{t('home.whereFrom')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {locatingLabel ? (
                  <ActivityIndicator size="small" color={colors.gray600} />
                ) : (
                  <Text style={styles.addressValue} numberOfLines={1}>{pickupLabel}</Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={styles.addressRow}
            onPress={() => navigation.navigate('SetDestination', { pickup: pickupParam, initialRideTypeId: service })}
          >
            <View style={[styles.addressDot, { backgroundColor: colors.black }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addressLabel}>{t('home.whereTo')}</Text>
              <Text style={styles.addressValue} numberOfLines={1}>{t('home.whereToPrompt')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsRow}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {rideTypes.map((rt) => {
            const active = rt.id === service;
            return (
              <Pressable
                key={rt.id}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setService(rt.id)}
              >
                <MaterialCommunityIcons
                  name={SERVICE_ICONS[rt.icon] ?? 'car'}
                  size={18}
                  color={active ? colors.white : colors.black}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(`home.${rt.id}Tab`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <Pressable style={styles.locateButton} onPress={locate}>
        <Ionicons name="navigate" size={20} color={colors.black} />
      </Pressable>

      <SafeAreaView style={styles.ctaArea} edges={['bottom', 'left', 'right']} pointerEvents="box-none">
        <Pressable
          style={styles.ctaButton}
          onPress={() => navigation.navigate('SetDestination', { pickup: pickupParam, initialRideTypeId: service })}
        >
          <Text style={styles.ctaText}>{t('home.order')}</Text>
        </Pressable>
      </SafeAreaView>

      <MainMenuModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenTripHistory={() => navigation.navigate('TripHistory')}
        onOpenSettings={() => navigation.navigate('Settings')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray50 },
  topArea: { position: 'absolute', top: 0, left: 0, right: 0, gap: spacing.sm },
  menuRow: { paddingHorizontal: spacing.md },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  addressCard: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  addressDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 4 },
  addressLabel: { ...typography.caption, color: colors.gray600 },
  addressValue: { ...typography.bodyBold, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.gray100, marginHorizontal: spacing.md },
  tabsRow: { flexGrow: 0, marginHorizontal: spacing.md },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...shadow.card,
  },
  tabActive: { backgroundColor: colors.primary },
  tabLabel: { ...typography.bodyBold },
  tabLabelActive: { color: colors.white },
  locateButton: {
    position: 'absolute',
    right: spacing.md,
    bottom: 260,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  ctaArea: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.md },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: 'center',
    ...shadow.card,
  },
  ctaText: { ...typography.h3, color: colors.white },
});
