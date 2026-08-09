import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow } from '../theme/theme';
import { formatFare } from '../utils/format';
import { listenToWalletBalance, listenToWalletConfig, listenToWalletTransactions, type WalletConfig, type WalletTransaction } from '../api/walletApi';
import { auth } from '../api/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

const TXN_LABEL: Record<WalletTransaction['type'], string> = {
  topup: 'Top-up',
  commission: 'Commission',
  adjustment: 'Adjustment',
};

const STATUS_COLOR: Record<WalletTransaction['status'], string> = {
  pending: colors.gray600,
  approved: '#1E9E4B',
  rejected: colors.danger,
  completed: colors.black,
};

export default function WalletScreen({ navigation }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [config, setConfig] = useState<WalletConfig | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsubBalance = listenToWalletBalance(uid, setBalance);
    const unsubConfig = listenToWalletConfig(setConfig);
    const unsubTxns = listenToWalletTransactions(uid, setTransactions);
    return () => {
      unsubBalance();
      unsubConfig();
      unsubTxns();
    };
  }, []);

  const currency = config?.currency ?? 'LAK';
  const belowMinimum = balance != null && config != null && balance < config.minimumBalance;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.black} />
        </Pressable>
        <Text style={typography.h2}>Wallet</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={[styles.balanceCard, belowMinimum && styles.balanceCardLow]}>
        <Text style={styles.balanceLabel}>Balance</Text>
        {balance == null ? (
          <ActivityIndicator color={colors.white} style={{ marginVertical: 8 }} />
        ) : (
          <Text style={styles.balanceAmount}>{formatFare(balance, currency)}</Text>
        )}
        {config && (
          <Text style={styles.minimumText}>
            Minimum to go online: {formatFare(config.minimumBalance, currency)}
          </Text>
        )}
        <Pressable style={styles.topUpButton} onPress={() => navigation.navigate('TopUp')}>
          <Ionicons name="add-circle-outline" size={18} color={colors.black} />
          <Text style={typography.bodyBold}>Top up</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Transaction history</Text>
      <FlatList
        data={transactions}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.gray600, textAlign: 'center', marginTop: spacing.lg }]}>
            No transactions yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.txnRow}>
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyBold}>{TXN_LABEL[item.type]}</Text>
              <Text style={typography.caption}>
                {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : ''}
              </Text>
              {item.note && <Text style={[typography.caption, { color: colors.gray600 }]}>{item.note}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typography.bodyBold, { color: item.amount >= 0 ? '#1E9E4B' : colors.danger }]}>
                {item.amount >= 0 ? '+' : ''}
                {formatFare(item.amount, currency)}
              </Text>
              <Text style={[typography.caption, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  balanceCard: {
    margin: spacing.md,
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  balanceCardLow: { backgroundColor: colors.danger },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', ...typography.caption },
  balanceAmount: { color: colors.white, fontSize: 32, fontWeight: '800', marginTop: 4 },
  minimumText: { color: 'rgba(255,255,255,0.7)', ...typography.caption, marginTop: 8 },
  topUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginTop: spacing.md,
  },
  sectionTitle: { ...typography.h3, marginHorizontal: spacing.md },
  txnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
});
