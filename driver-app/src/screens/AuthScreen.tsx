import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { signInWithPhoneNumber, type ConfirmationResult } from '@react-native-firebase/auth';
import { doc, setDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography, brand } from '../theme/theme';
import { auth, db } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

// Three-step flow: verify phone number (native OTP, no reCAPTCHA widget
// needed) → collect vehicle profile → write the driver doc as 'pending'
// for an admin to approve in the dashboard.
export default function AuthScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'phone' | 'code' | 'profile'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');

  const sendCode = async () => {
    if (!phone.startsWith('+')) {
      Alert.alert(t('auth.includeCountryCodeTitle'), t('auth.includeCountryCodeBody'));
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithPhoneNumber(auth, phone);
      setConfirmation(result);
      setStep('code');
    } catch (err: any) {
      Alert.alert(t('auth.couldNotSendCode'), err.message ?? t('auth.checkNumberAndRetry'));
    } finally {
      setLoading(false);
    }
  };

  const confirmCode = async () => {
    if (!confirmation) return;
    setLoading(true);
    try {
      await confirmation.confirm(code);
      setStep('profile');
    } catch (err: any) {
      Alert.alert(t('auth.incorrectCode'), err.message ?? t('auth.pleaseTryAgain'));
    } finally {
      setLoading(false);
    }
  };

  const canSubmitProfile = name && vehicleModel && plateNumber;

  const submitProfile = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !canSubmitProfile) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'drivers', uid), {
        name,
        phone,
        vehicleModel,
        plateNumber,
        verificationStatus: 'pending', // an admin approves this in the dashboard
        rating: 5,
        ratingCount: 0,
        totalRides: 0,
        isOnline: false,
        currentLocation: null,
        lastLocationAt: null,
        createdAt: serverTimestamp(),
      });
      navigation.replace('Home');
    } catch (err: any) {
      Alert.alert(t('auth.signUpFailed'), err.message ?? t('auth.pleaseTryAgain'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={typography.h1}>{brand.name}</Text>

        {step === 'phone' && (
          <>
            <Text style={styles.subtext}>{t('auth.enterPhoneToStart')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth.phonePlaceholder')}
              placeholderTextColor={colors.gray400}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              autoFocus
            />
            <Pressable style={styles.submitButton} disabled={loading || !phone} onPress={sendCode}>
              {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.sendCode')}</Text>}
            </Pressable>
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={styles.subtext}>{t('auth.enterCodeSentTo', { phone })}</Text>
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
            <Pressable style={styles.submitButton} disabled={loading || code.length < 6} onPress={confirmCode}>
              {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.verify')}</Text>}
            </Pressable>
          </>
        )}

        {step === 'profile' && (
          <>
            <Text style={styles.subtext}>{t('auth.almostDone')}</Text>
            <Field label={t('auth.fullName')} value={name} onChangeText={setName} placeholder={t('auth.fullNamePlaceholder')} />
            <Field label={t('auth.vehicleModel')} value={vehicleModel} onChangeText={setVehicleModel} placeholder={t('auth.vehicleModelPlaceholder')} />
            <Field label={t('auth.plateNumber')} value={plateNumber} onChangeText={setPlateNumber} placeholder={t('auth.plateNumberPlaceholder')} />

            <Pressable
              style={[styles.submitButton, !canSubmitProfile && { opacity: 0.5 }]}
              disabled={!canSubmitProfile || loading}
              onPress={submitProfile}
            >
              {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.finishSignUp')}</Text>}
            </Pressable>
            <Text style={styles.note}>{t('auth.reviewNote')}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.gray400}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  subtext: { ...typography.body, color: colors.gray600, marginTop: 4, marginBottom: spacing.lg },
  fieldLabel: { ...typography.caption, color: colors.gray600, marginBottom: 4 },
  input: { backgroundColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, ...typography.body },
  submitButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  note: { ...typography.caption, color: colors.gray600, textAlign: 'center', marginTop: spacing.md },
});
