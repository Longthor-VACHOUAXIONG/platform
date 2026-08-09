import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { signInWithPhoneNumber, type ConfirmationResult } from '@react-native-firebase/auth';
import { doc, setDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { useTranslation } from 'react-i18next';
import { colors, typography, radius, spacing, brand } from '../theme/theme';
import { auth, db } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// Two-step native phone auth: send code -> confirm code. No reCAPTCHA widget
// needed because @react-native-firebase/auth uses each platform's native
// verification (Play Integrity on Android, silent APNs on iOS, falling back
// to reCAPTCHA automatically only when needed).
export default function OnboardingScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!phone.startsWith('+')) {
      Alert.alert(t('onboarding.includeCountryCodeTitle'), t('onboarding.includeCountryCodeBody'));
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithPhoneNumber(auth, phone);
      setConfirmation(result);
      setStep('code');
    } catch (err: any) {
      Alert.alert(t('onboarding.couldNotSendCode'), err.message ?? t('onboarding.checkNumberAndRetry'));
    } finally {
      setLoading(false);
    }
  };

  const confirmCode = async () => {
    if (!confirmation) return;
    setLoading(true);
    try {
      const cred = await confirmation.confirm(code);
      const uid = cred?.user.uid;
      if (!uid) throw new Error('Sign-in did not return a user.');

      await setDoc(
        doc(db, 'users', uid),
        {
          role: 'rider',
          name: 'Rider',
          phone,
          createdAt: serverTimestamp(),
          rating: 5,
          ratingCount: 0,
        },
        { merge: true }
      );
      navigation.replace('Home');
    } catch (err: any) {
      Alert.alert(t('onboarding.incorrectCode'), err.message ?? t('onboarding.pleaseTryAgain'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>G</Text>
        </View>
        <Text style={styles.brandText}>{brand.name}</Text>
      </View>

      <View style={styles.illustrationBox}>
        <MaterialCommunityIcons name="cellphone-message" size={80} color={colors.black} />
      </View>

      {step === 'phone' ? (
        <>
          <Text style={styles.headline}>{t('onboarding.whatsYourNumber')}</Text>
          <Text style={styles.subtext}>{t('onboarding.wellTextYouACode')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('onboarding.phonePlaceholder')}
            placeholderTextColor={colors.gray400}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            autoFocus
          />
          <Pressable style={styles.primaryButton} disabled={loading || !phone} onPress={sendCode}>
            {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('onboarding.sendCode')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.headline}>{t('onboarding.enterTheCode')}</Text>
          <Text style={styles.subtext}>{t('onboarding.weSentACode', { phone })}</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor={colors.gray400}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            maxLength={6}
            autoFocus
          />
          <Pressable style={styles.primaryButton} disabled={loading || code.length < 6} onPress={confirmCode}>
            {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('onboarding.verify')}</Text>}
          </Pressable>
          <Pressable onPress={() => setStep('phone')} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>{t('onboarding.useADifferentNumber')}</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.terms}>
        {t('onboarding.termsPrefix')} <Text style={styles.link}>{t('onboarding.termsOfUse')}</Text> {t('onboarding.and')}{' '}
        <Text style={styles.link}>{t('onboarding.privacyPolicy')}</Text>
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, paddingHorizontal: spacing.lg },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  brandMark: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  brandMarkText: { fontWeight: '800', color: colors.black },
  brandText: { ...typography.h3 },
  illustrationBox: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, marginBottom: spacing.lg, height: 140 },
  headline: { ...typography.h1, textAlign: 'center' },
  subtext: { ...typography.body, textAlign: 'center', color: colors.gray600, marginTop: spacing.xs, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center' },
  link: { textDecorationLine: 'underline', color: colors.black },
  terms: { ...typography.caption, textAlign: 'center', color: colors.gray600, marginTop: 'auto', marginBottom: spacing.lg },
});
