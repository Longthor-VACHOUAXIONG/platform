import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ActivityIndicator } from 'react-native';
import OsmMapView, { Marker } from '../components/OsmMapView';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { reverseGeocodeLabel } from '../utils/geocode';
import MainMenuModal from '../components/MainMenuModal';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const DEFAULT_REGION = {
  latitude: 17.9757,
  longitude: 102.6331, // Vientiane, as a sensible default — swap per your market
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [pickupLabel, setPickupLabel] = useState('');
  const [locatingLabel, setLocatingLabel] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
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
      setLocatingLabel(false);
    })();
  }, []);

  const pickupParam = { label: pickupLabel, lat: region.latitude, lng: region.longitude };

  return (
    <View style={styles.container}>
      <OsmMapView
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        region={region}
      >
        <Marker coordinate={region} />
      </OsmMapView>

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)}>
          <Ionicons name="menu" size={22} color={colors.black} />
        </Pressable>

        <Pressable style={styles.pickupCard}>
          <Text style={styles.pickupLabel}>{t('home.whereFrom')}</Text>
          <View style={styles.pickupRow}>
            {locatingLabel ? (
              <ActivityIndicator size="small" color={colors.gray600} />
            ) : (
              <Text style={styles.pickupValue} numberOfLines={1}>{pickupLabel}</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.gray600} />
          </View>
        </Pressable>
      </SafeAreaView>

      <Pressable style={styles.locateButton}>
        <Ionicons name="navigate" size={20} color={colors.black} />
      </Pressable>

      <SafeAreaView style={styles.sheet}>
        <Pressable
          style={styles.searchBar}
          onPress={() => navigation.navigate('SetDestination', { pickup: pickupParam })}
        >
          <Ionicons name="search" size={18} color={colors.gray600} />
          <Text style={styles.searchText}>{t('home.whereToPrompt')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.gray600} />
        </Pressable>

        <View style={styles.categoryRow}>
          <Pressable
            style={styles.categoryCard}
            onPress={() => navigation.navigate('SetDestination', { pickup: pickupParam })}
          >
            <MaterialCommunityIcons name="car" size={40} color={colors.black} />
            <Text style={styles.categoryText}>{t('home.cityRides')}</Text>
          </Pressable>
          <Pressable style={styles.categoryCard}>
            <MaterialCommunityIcons name="package-variant" size={40} color={colors.black} />
            <Text style={styles.categoryText}>{t('home.couriers')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <MainMenuModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenTripHistory={() => navigation.navigate('TripHistory')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray100 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  pickupCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  pickupLabel: { ...typography.caption, color: colors.gray600 },
  pickupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  pickupValue: { ...typography.bodyBold, flex: 1 },
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  searchText: { ...typography.body, color: colors.gray600, flex: 1 },
  categoryRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  categoryCard: {
    flex: 1,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  categoryText: { ...typography.bodyBold },
});
