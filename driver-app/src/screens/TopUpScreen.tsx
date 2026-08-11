import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Image, ActivityIndicator, ScrollView, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing, typography } from '../theme/theme';
import { formatFare } from '../utils/format';
import { listenToWalletConfig, uploadTopUpProof, requestTopUp, initiateBcelTopUp, type WalletConfig } from '../api/walletApi';
import { auth } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TopUp'>;

export default function TopUpScreen({ navigation }: Props) {
  const [config, setConfig] = useState<WalletConfig | null>(null);
  const [amount, setAmount] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => listenToWalletConfig(setConfig), []);

  const pickProof = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach your payment proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setProofUri(result.assets[0].uri);
    }
  };

  const submitManual = async () => {
    const amountNum = Number(amount);
    const uid = auth.currentUser?.uid;
    if (!uid || !amountNum || amountNum <= 0) return;

    setSubmitting(true);
    try {
      let proofImageUrl: string | undefined;
      if (proofUri) {
        proofImageUrl = await uploadTopUpProof(uid, proofUri);
      }
      await requestTopUp(amountNum, proofImageUrl);
      Alert.alert(
        'Request submitted',
        'An admin will review your top-up shortly. Your balance will update once approved.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Could not submit', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAuto = async () => {
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) return;

    setSubmitting(true);
    try {
      const result = await initiateBcelTopUp(amountNum);
      if (result.data.paymentUrl) {
        await Linking.openURL(result.data.paymentUrl);
      }
    } catch (err: any) {
      if (err.code === 'functions/unimplemented') {
        Alert.alert(
          'Auto top-up not ready yet',
          "The admin has enabled BCEL auto top-up, but the connection to BCEL isn't finished on our end yet. Please ask your admin, or use manual top-up for now."
        );
      } else if (err.code === 'functions/failed-precondition') {
        Alert.alert('Auto top-up unavailable', 'Please ask your admin to finish setting up BCEL, or use manual top-up.');
      } else {
        Alert.alert('Could not start top-up', err.message ?? 'Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submit = () => (config?.topUpMode === 'auto' ? submitAuto() : submitManual());
  const canSubmit = Number(amount) > 0 && !submitting;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.black} />
          </Pressable>
          <Text style={typography.h2}>Top up wallet</Text>
          <View style={{ width: 22 }} />
        </View>

        {!config ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.black} />
        ) : config.topUpMode === 'auto' ? (
          <>
            <Text style={styles.instructions}>
              Enter an amount and continue — you'll be sent to BCEL to complete the payment
              securely, then your balance updates automatically.
            </Text>

            <Text style={styles.fieldLabel}>Amount ({config.currency})</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 100000"
              placeholderTextColor={colors.gray400}
            />

            <Pressable style={[styles.submitButton, !canSubmit && { opacity: 0.5 }]} disabled={!canSubmit} onPress={submit}>
              {submitting ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={typography.bodyBold}>
                  Continue with BCEL {amount ? formatFare(Number(amount), config.currency) : ''}
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.instructions}>
              1. Transfer any amount to the bank account below via your banking app's QR scanner.{'\n'}
              2. Enter the amount you sent and attach a screenshot of the transfer confirmation.{'\n'}
              3. Submit — an admin reviews and approves it, usually within a few hours.
            </Text>

            {config.bankQrImageUrl && (
              <Image source={{ uri: config.bankQrImageUrl }} style={styles.qrImage} resizeMode="contain" />
            )}

            <View style={styles.bankCard}>
              <Row label="Bank" value={config.bankName} />
              <Row label="Account name" value={config.bankAccountName} />
              <Row label="Account number" value={config.bankAccountNumber} />
            </View>

            <Text style={styles.fieldLabel}>Amount you transferred ({config.currency})</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 100000"
              placeholderTextColor={colors.gray400}
            />

            <Text style={styles.fieldLabel}>Payment proof screenshot</Text>
            <Pressable style={styles.photoPicker} onPress={pickProof}>
              {proofUri ? (
                <Image source={{ uri: proofUri }} style={styles.proofPreview} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={24} color={colors.gray600} />
                  <Text style={[typography.body, { color: colors.gray600 }]}>Tap to attach a screenshot</Text>
                </>
              )}
            </Pressable>

            <Pressable style={[styles.submitButton, !canSubmit && { opacity: 0.5 }]} disabled={!canSubmit} onPress={submit}>
              {submitting ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={typography.bodyBold}>
                  Submit {amount ? formatFare(Number(amount), config.currency) : ''}
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={[typography.caption, { color: colors.gray600 }]}>{label}</Text>
      <Text style={typography.bodyBold}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  instructions: { ...typography.body, color: colors.gray600, marginBottom: spacing.md, lineHeight: 20 },
  qrImage: { width: '100%', height: 220, backgroundColor: colors.gray100, borderRadius: radius.md, marginBottom: spacing.md },
  bankCard: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { ...typography.caption, color: colors.gray600, marginBottom: 6, marginTop: spacing.sm },
  input: { backgroundColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, ...typography.body },
  photoPicker: {
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  proofPreview: { width: '100%', height: '100%' },
  submitButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg },
});
