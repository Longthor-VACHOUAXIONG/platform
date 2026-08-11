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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
import { colors, radius, spacing, typography, brand } from '../theme/theme';
import { auth, db } from '../api/firebaseConfig';
import { uploadVerificationPhoto } from '../api/driverApi';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

type PhotoKind = 'idPhoto' | 'licensePhoto' | 'vehiclePhoto' | 'selfiePhoto';

// Accounts are identified by phone number. Registration OTP-verifies the
// phone (native, no reCAPTCHA widget needed) and then links an email/password
// credential built from the phone (e.g. 856205555555@gofair.phone) so the
// driver can log back in with a password OR a fresh OTP.
function phoneToEmail(phone: string): string {
  return phone.replace(/[^0-9]/g, '') + '@gofair.phone';
}

// One auth screen with two modes. Login = password or OTP; Register = phone
// OTP → profile (name, vehicle, verification photos) + password → pending doc
// for the admin to approve.
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

  // ---- register (OTP → profile) ----
  const [regStep, setRegStep] = useState<'phone' | 'code' | 'profile'>('phone');
  const [regPhone, setRegPhone] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regConfirmation, setRegConfirmation] = useState<ConfirmationResult | null>(null);
  const [name, setName] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [photos, setPhotos] = useState<Record<PhotoKind, string | null>>({
    idPhoto: null,
    licensePhoto: null,
    vehiclePhoto: null,
    selfiePhoto: null,
  });

  // Driver docs are read to decide login-vs-finish-registration; this stays
  // in one helper so both OTP-login and post-verify continue the same way.
  const routeAfterSignIn = async (user: User) => {
    const existing = await getDoc(doc(db, 'drivers', user.uid));
    if (existing.exists()) {
      navigation.replace('Home');
      return;
    }
    // Verified phone but no profile yet → finish registration (profile step).
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

  const pickPhoto = async (kind: PhotoKind) => {
    Alert.alert(t('auth.addPhoto'), t('auth.choosePhotoSource'), [
      { text: t('auth.takePhoto'), onPress: () => pickFrom('camera', kind) },
      { text: t('auth.chooseFromGallery'), onPress: () => pickFrom('library', kind) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const pickFrom = async (source: 'camera' | 'library', kind: PhotoKind) => {
    try {
      let result;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(t('auth.permissionNeeded'), t('auth.cameraPermissionBody'));
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          allowsEditing: true,
          aspect: [4, 3],
          cameraType: kind === 'selfiePhoto' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(t('auth.permissionNeeded'), t('auth.libraryPermissionBody'));
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          allowsEditing: true,
          aspect: [4, 3],
        });
      }
      if (!result.canceled && result.assets[0]) {
        setPhotos((prev) => ({ ...prev, [kind]: result.assets[0].uri }));
      }
    } catch (err: any) {
      Alert.alert(t('auth.photoError'), err.message ?? t('auth.pleaseTryAgain'));
    }
  };

  const canSubmitProfile =
    !!name && !!vehicleModel && !!plateNumber &&
    password.length >= 6 && password === passwordConfirm &&
    !!photos.idPhoto && !!photos.licensePhoto && !!photos.vehiclePhoto && !!photos.selfiePhoto;

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
      // works. Ignore "already linked / email already in use" — the driver
      // already has a password, which is fine.
      try {
        await linkWithCredential(auth.currentUser!, EmailAuthProvider.credential(phoneToEmail(regPhone), password));
      } catch (err: any) {
        if (!/already-linked|email-already-in-use|credential-already-in-use|account-exists/.test(err.code ?? '')) {
          throw err;
        }
      }

      // A returning driver already has an approved profile, wallet balance,
      // and ride history on this doc — a plain setDoc() would wipe all of
      // that, so only create the profile for brand-new drivers.
      const existing = await getDoc(doc(db, 'drivers', uid));
      if (!existing.exists()) {
        // Upload the four verification photos first, then store their URLs
        // so the admin can review them in the dashboard.
        const [idPhotoUrl, licensePhotoUrl, vehiclePhotoUrl, selfiePhotoUrl] = await Promise.all([
          uploadVerificationPhoto(uid, 'id', photos.idPhoto!),
          uploadVerificationPhoto(uid, 'license', photos.licensePhoto!),
          uploadVerificationPhoto(uid, 'vehicle', photos.vehiclePhoto!),
          uploadVerificationPhoto(uid, 'selfie', photos.selfiePhoto!),
        ]);
        await setDoc(doc(db, 'drivers', uid), {
          name,
          phone: regPhone,
          vehicleModel,
          plateNumber,
          verificationStatus: 'pending', // an admin approves this in the dashboard
          idPhotoUrl,
          licensePhotoUrl,
          vehiclePhotoUrl,
          selfiePhotoUrl,
          walletBalance: 0, // trust field — must match the firestore.rules create guard
          rating: 5,
          ratingCount: 0,
          totalRides: 0,
          isOnline: false,
          currentLocation: null,
          lastLocationAt: null,
          createdAt: serverTimestamp(),
        });
      }
      navigation.replace('Home');
    } catch (err: any) {
      Alert.alert(t('auth.signUpFailed'), err.message ?? t('auth.pleaseTryAgain'));
    } finally {
      setLoading(false);
    }
  };

  const photoFields: { key: PhotoKind; label: string }[] = [
    { key: 'idPhoto', label: t('auth.idPhoto') },
    { key: 'licensePhoto', label: t('auth.licensePhoto') },
    { key: 'vehiclePhoto', label: t('auth.vehiclePhoto') },
    { key: 'selfiePhoto', label: t('auth.selfiePhoto') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={typography.h1}>{brand.name}</Text>

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
              <Pressable style={styles.submitButton} disabled={loading || !loginPhone || !loginPassword} onPress={loginWithPassword}>
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
                  <Pressable style={styles.submitButton} disabled={loading || loginCode.length < 6} onPress={confirmLoginCode}>
                    {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.verify')}</Text>}
                  </Pressable>
                </>
              ) : (
                <Pressable style={styles.submitButton} disabled={loading || !loginPhone} onPress={sendLoginCode}>
                  {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.sendCode')}</Text>}
                </Pressable>
              )}
            </>
          )
        ) : regStep === 'phone' ? (
          <>
            <Text style={styles.subtext}>{t('auth.enterPhoneToStart')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth.phonePlaceholder')}
              placeholderTextColor={colors.gray400}
              keyboardType="phone-pad"
              value={regPhone}
              onChangeText={setRegPhone}
              autoFocus
            />
            <Pressable style={styles.submitButton} disabled={loading || !regPhone} onPress={sendRegisterCode}>
              {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.sendCode')}</Text>}
            </Pressable>
          </>
        ) : regStep === 'code' ? (
          <>
            <Text style={styles.subtext}>{t('auth.enterCodeSentTo', { phone: regPhone })}</Text>
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
            <Pressable style={styles.submitButton} disabled={loading || regCode.length < 6} onPress={confirmRegisterCode}>
              {loading ? <ActivityIndicator color={colors.black} /> : <Text style={typography.bodyBold}>{t('auth.verify')}</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtext}>{t('auth.almostDone')}</Text>
            <Field label={t('auth.fullName')} value={name} onChangeText={setName} placeholder={t('auth.fullNamePlaceholder')} />
            <Field label={t('auth.vehicleModel')} value={vehicleModel} onChangeText={setVehicleModel} placeholder={t('auth.vehicleModelPlaceholder')} />
            <Field label={t('auth.plateNumber')} value={plateNumber} onChangeText={setPlateNumber} placeholder={t('auth.plateNumberPlaceholder')} />
            <Field
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.passwordPlaceholder')}
              secureTextEntry
            />
            <Field
              label={t('auth.confirmPassword')}
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              placeholder={t('auth.confirmPasswordPlaceholder')}
              secureTextEntry
            />

            <Text style={styles.photoSectionTitle}>{t('auth.verificationPhotos')}</Text>
            <Text style={styles.photoSectionHint}>{t('auth.verificationPhotosHint')}</Text>

            {photoFields.map((f) => (
              <PhotoField key={f.key} label={f.label} uri={photos[f.key]} onPress={() => pickPhoto(f.key)} t={t} />
            ))}

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

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
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
        secureTextEntry={props.secureTextEntry}
      />
    </View>
  );
}

function PhotoField({ label, uri, onPress, t }: { label: string; uri: string | null; onPress: () => void; t: (key: string) => string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.photoPicker} onPress={onPress}>
        {uri ? (
          <Image source={{ uri }} style={styles.photoPreview} />
        ) : (
          <>
            <Ionicons name="camera-outline" size={24} color={colors.gray600} />
            <Text style={[typography.caption, { color: colors.gray600 }]}>{t('auth.tapToAddPhoto')}</Text>
          </>
        )}
      </Pressable>
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
  tabRow: { flexDirection: 'row', backgroundColor: colors.gray100, borderRadius: radius.pill, padding: 4, marginTop: spacing.md, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.body, color: colors.gray600 },
  tabTextActive: { ...typography.bodyBold, color: colors.black },
  methodRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  methodChip: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.gray100 },
  methodChipActive: { backgroundColor: colors.black },
  methodChipText: { ...typography.caption, color: colors.gray600 },
  methodChipTextActive: { color: colors.primary, fontWeight: '700' },
  photoSectionTitle: { ...typography.h3, marginTop: spacing.md, marginBottom: 4 },
  photoSectionHint: { ...typography.caption, color: colors.gray600, marginBottom: spacing.md },
  photoPicker: {
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
});
