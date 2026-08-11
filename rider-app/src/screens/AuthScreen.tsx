import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  type ConfirmationResult,
  type User,
} from '@react-native-firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { useTranslation } from 'react-i18next';
import { colors, typography, radius, spacing, brand } from '../theme/theme';
import { auth, db } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

// Accounts are identified by phone number. Registration OTP-verifies the
// phone (native, no reCAPTCHA widget needed) and then links an email/password
// credential built from the phone (e.g. 856205555555@gofair.phone) so the
// rider can log back in with a password OR a fresh OTP. Rider registration
// only collects a phone number + name.
function phoneToEmail(phone: string): string {
  return phone.replace(/[^0-9]/g, '') + '@gofair.phone';
}

// One auth screen with two modes. Login = password or OTP; Register = phone
// OTP → name + password → create the rider doc.
export default function AuthScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);

  // ---- login (password or OTP) ----
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginConfirmation, setLoginConfirmation] = useState<ConfirmationResult | null>(null);

  // ---- register (OTP → name + password) ----
  const [regStep, setRegStep] = useState<'phone' | 'code' | 'profile'>('phone');
  const [regPhone, setRegPhone] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regConfirmation, setRegConfirmation] = useState<ConfirmationResult | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // Rider docs are read to decide login-vs-finish-registration; this stays
  // in one helper so both OTP-login and post-verify continue the same way.
  const routeAfterSignIn = async (user: User) => {
    const existing = await getDoc(doc(db, 'users', user.uid));
    if (existing.exists()) {
      navigation.replace('Home');
      return;
    }
    // Verified phone but no profile yet → finish registration (name step).
    setMode('register');
    setRegStep('profile');
    setRegPhone(loginPhone || regPhone);
  };

  // ---------- LOGIN ----------
  const loginWithPassword = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, phoneToEmail(loginPhone), loginPassword);
      navigation.replace('Home');
    } catch (err: any) {
      Alert.alert(t('auth.loginFailed'), err.message ?? t('auth.wrongCredentials'));
    } finally {
      setLoading(false);
    }
  };

  const sendLoginCode = async () => {
    if (!loginPhone.startsWith('+')) {
      Alert.alert(t('auth.includeCountryCodeTitle'), t('auth.includeCountryCodeBody'));
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithPhoneNumber(auth, loginPhone);
      setLoginConfirmation(result);
      setLoginCode('');
    } catch (err: any) {
      Alert.alert(t('auth.couldNotSendCode'), err.message ?? t('auth.checkNumberAndRetry'));
    } finally {
      setLoading(false);
    }
  };

  const confirmLoginCode = async () => {
    if (!loginConfirmation) return;
    setLoading(true);
    try {
      const cred = await loginConfirmation.confirm(loginCode);
      await routeAfterSignIn(cred.user);
    } catch (err: any) {
      Alert.alert(t('auth.incorrectCode'), err.message ?? t('auth.pleaseTryAgain'));
    } finally {
      setLoading(false);
    }
  };

  // ---------- REGISTER ----------
  const sendRegisterCode = async () => {
    if (!regPhone.startsWith('+')) {
      Alert.alert(t('auth.includeCountryCodeTitle'), t('auth.includeCountryCodeBody'));
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithPhoneNumber(auth, regPhone);
      setRegConfirmation(result);
      setRegStep('code');
    } catch (err: any) {
      Alert.alert(t('auth.couldNotSendCode'), err.message ?? t('auth.checkNumberAndRetry'));
    } finally {
      setLoading(false);
    }
  };

  const confirmRegisterCode = async () => {
    if (!regConfirmation) return;
    setLoading(true);
    try {
      const cred = await regConfirmation.confirm(regCode);
      await routeAfterSignIn(cred.user);
    } catch (err: any) {
      Alert.alert(t('auth.incorrectCode'), err.message ?? t('auth.pleaseTryAgain'));
    } finally {
      setLoading(false);
    }
  };

  const canSubmitProfile =
    !!name && password.length >= 6 && password === passwordConfirm;

  const submitProfile = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert(t('auth.signUpFailed'), t('auth.pleaseTryAgain'));
      return;
    }
    if (!canSubmitProfile) return;
    setLoading(true);
    try {
      // Link email/password to the phone-verified account so password login
      // works. Ignore "already linked / email already in use" — the rider
      // already has a password, which is fine.
      try {
        await linkWithCredential(auth.currentUser!, EmailAuthProvider.credential(phoneToEmail(regPhone), password));
      } catch (err: any) {
        if (!/already-linked|email-already-in-use|credential-already-in-use|account-exists/.test(err.code ?? '')) {
          throw err;
        }
      }

      // merge:true so a re-registration never wipes rating/trip history.
      await setDoc(
        doc(db, 'users', uid),
        {
          role: 'rider',
          name,
          phone: regPhone,
          createdAt: serverTimestamp(),
          rating: 5,
          ratingCount: 0,
        },
        { merge: true }
      );
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
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>G</Text>
          </View>
          <Text style={styles.brandText}>{brand.name}</Text>
        </View>

        <View style={styles.tabRow}>
          <Pressable style={[styles.tab, mode === 'login' && styles.tabActive]} onPress={() => setMode('login')}>
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>{t('auth.loginTab')}</Text>
          </Pressable>
          <Pressable style={[styles.tab, mode === 'register' && styles.tabActive]} onPress={() => setMode('register')}>
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>{t('auth.registerTab')}</Text>
          </Pressable>
        </View>

        {mode === 'login' ? (
          loginMethod === 'password' ? (
            <>
              <Text style={styles.subtext}>{t('auth.loginSubtext')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor={colors.gray400}
                keyboardType="phone-pad"
                value={loginPhone}
                onChangeText={setLoginPhone}
              />
              <TextInput
                style={styles.input}
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor={colors.gray400}
                secureTextEntry
                value={loginPassword}
                onChangeText={setLoginPassword}
              />
              <Pressable style={styles.primaryButton} disabled={loading || !loginPhone || !loginPassword} onPress={loginWithPassword}>
                {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.loginButton')}</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.subtext}>{t('auth.loginOtpSubtext')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor={colors.gray400}
                keyboardType="phone-pad"
                value={loginPhone}
                onChangeText={setLoginPhone}
              />
              {loginConfirmation ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="123456"
                    placeholderTextColor={colors.gray400}
                    keyboardType="number-pad"
                    value={loginCode}
                    onChangeText={setLoginCode}
                    maxLength={6}
                  />
                  <Pressable style={styles.primaryButton} disabled={loading || loginCode.length < 6} onPress={confirmLoginCode}>
                    {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.verify')}</Text>}
                  </Pressable>
                </>
              ) : (
                <Pressable style={styles.primaryButton} disabled={loading || !loginPhone} onPress={sendLoginCode}>
                  {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.sendCode')}</Text>}
                </Pressable>
              )}
            </>
          )
        ) : regStep === 'phone' ? (
          <>
            <Text style={styles.subtext}>{t('auth.whatsYourNumber')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth.phonePlaceholder')}
              placeholderTextColor={colors.gray400}
              keyboardType="phone-pad"
              value={regPhone}
              onChangeText={setRegPhone}
              autoFocus
            />
            <Pressable style={styles.primaryButton} disabled={loading || !regPhone} onPress={sendRegisterCode}>
              {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.sendCode')}</Text>}
            </Pressable>
          </>
        ) : regStep === 'code' ? (
          <>
            <Text style={styles.subtext}>{t('auth.weSentACode', { phone: regPhone })}</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={colors.gray400}
              keyboardType="number-pad"
              value={regCode}
              onChangeText={setRegCode}
              maxLength={6}
              autoFocus
            />
            <Pressable style={styles.primaryButton} disabled={loading || regCode.length < 6} onPress={confirmRegisterCode}>
              {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.verify')}</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtext}>{t('auth.almostDone')}</Text>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.fieldLabel}>{t('auth.name')}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t('auth.namePlaceholder')}
                placeholderTextColor={colors.gray400}
              />
            </View>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.fieldLabel}>{t('auth.password')}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor={colors.gray400}
                secureTextEntry
              />
            </View>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.fieldLabel}>{t('auth.confirmPassword')}</Text>
              <TextInput
                style={styles.input}
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder={t('auth.confirmPasswordPlaceholder')}
                placeholderTextColor={colors.gray400}
                secureTextEntry
              />
            </View>
            <Pressable
              style={[styles.primaryButton, !canSubmitProfile && { opacity: 0.5 }]}
              disabled={!canSubmitProfile || loading}
              onPress={submitProfile}
            >
              {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.createAccount')}</Text>}
            </Pressable>
          </>
        )}

        {mode === 'login' && (
          <View style={styles.methodRow}>
            <Pressable
              style={[styles.methodChip, loginMethod === 'password' && styles.methodChipActive]}
              onPress={() => setLoginMethod('password')}
            >
              <Text style={[styles.methodChipText, loginMethod === 'password' && styles.methodChipTextActive]}>
                {t('auth.loginWithPassword')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.methodChip, loginMethod === 'otp' && styles.methodChipActive]}
              onPress={() => setLoginMethod('otp')}
            >
              <Text style={[styles.methodChipText, loginMethod === 'otp' && styles.methodChipTextActive]}>
                {t('auth.loginWithOtp')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  brandMark: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  brandMarkText: { fontWeight: '800', color: colors.black },
  brandText: { ...typography.h3 },
  subtext: { ...typography.body, color: colors.gray600, marginTop: 4, marginBottom: spacing.lg },
  fieldLabel: { ...typography.caption, color: colors.gray600, marginBottom: 4 },
  input: {
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    marginBottom: spacing.md,
  },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  tabRow: { flexDirection: 'row', backgroundColor: colors.gray100, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.body, color: colors.gray600 },
  tabTextActive: { ...typography.bodyBold, color: colors.black },
  methodRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  methodChip: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.gray100 },
  methodChipActive: { backgroundColor: colors.black },
  methodChipText: { ...typography.caption, color: colors.gray600 },
  methodChipTextActive: { color: colors.primary, fontWeight: '700' },
});
