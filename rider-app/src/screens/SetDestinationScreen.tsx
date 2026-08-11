import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OsmMapView, { type Region } from '../components/OsmMapView';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { reverseGeocodeLabel } from '../utils/geocode';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SetDestination'>;

export default function SetDestinationScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { pickup } = route.params;

  // Start the map centered a short distance from pickup so the pin isn't
  // sitting exactly on top of the rider's own location.
  const [region, setRegion] = useState<Region>({
    latitude: pickup.lat + 0.01,
    longitude: pickup.lng + 0.01,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });
  const [label, setLabel] = useState(t('setDestination.moveMapPrompt'));
  const [resolving, setResolving] = useState(false);
  // Ignore stale reverse-geocode responses — a slow older request must not
  // overwrite the label of a newer map position.
  const geocodeSeq = useRef(0);

  const onRegionChangeComplete = async (next: Region) => {
    const seq = ++geocodeSeq.current;
    setRegion(next);
    setResolving(true);
    const resolved = await reverseGeocodeLabel(next.latitude, next.longitude);
    if (seq !== geocodeSeq.current) return;
    setLabel(resolved);
    setResolving(false);
  };

  return (
    <View style={styles.container}>
      <OsmMapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onRegionChangeComplete={onRegionChangeComplete}
      />

      {/* Fixed center pin — user drags the map underneath it */}
      <View style={styles.pinWrap} pointerEvents="none">
        <View style={styles.pinLabel}>
          {resolving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.pinLabelText} numberOfLines={1}>{label}</Text>
          )}
        </View>
        <View style={styles.pinIcon}>
          <Ionicons name="flag" size={18} color={colors.white} />
        </View>
        <View style={styles.pinStem} />
      </View>

      <SafeAreaView style={styles.topBar} edges={['top']}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.black} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView style={styles.bottomBar} edges={['bottom', 'left', 'right']}>
        <Pressable
          style={[styles.doneButton, resolving && styles.doneButtonDisabled]}
          disabled={resolving}
          onPress={() =>
            navigation.navigate('ChooseRide', {
              pickup,
              destination: { label, lat: region.latitude, lng: region.longitude },
            })
          }
        >
          <Text style={styles.doneText}>{t('common.done')}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pinWrap: {
    position: 'absolute',
    top: '45%',
    left: '50%',
    marginLeft: -70,
    width: 140,
    marginTop: -50,
    alignItems: 'center',
  },
  pinLabel: {
    backgroundColor: colors.black,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginBottom: 4,
    maxWidth: 160,
  },
  pinLabelText: { color: colors.white, ...typography.caption, fontWeight: '700', textAlign: 'center' },
  pinIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  pinStem: { width: 2, height: 16, backgroundColor: colors.black, alignSelf: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, paddingHorizontal: spacing.md },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.md },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: 'center',
  },
  doneText: { ...typography.h3 },
  doneButtonDisabled: { opacity: 0.5 },
});
