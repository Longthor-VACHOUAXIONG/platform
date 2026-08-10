import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { colors, brand, typography } from '../theme/theme';
import { auth } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      // Firebase Auth persists sessions — returning drivers should go
      // straight home, not through the phone-OTP flow every launch.
      navigation.replace(auth.currentUser ? 'Home' : 'Auth');
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity: fade, alignItems: 'center' }}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>G</Text>
        </View>
        <Text style={styles.tagline}>{brand.tagline}</Text>
        <Text style={styles.brandName}>{brand.name}</Text>
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.black} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  logoMark: { width: 88, height: 88, borderRadius: 24, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  logoText: { color: colors.primary, fontSize: 44, fontWeight: '800' },
  tagline: { ...typography.h2, color: colors.black, marginBottom: 8, textAlign: 'center', paddingHorizontal: 40 },
  brandName: { ...typography.h3, color: colors.black },
});
