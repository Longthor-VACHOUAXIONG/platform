import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '../theme/theme';
import { auth, db } from '../api/firebaseConfig';
import { doc, getDoc } from '@react-native-firebase/firestore';
import LanguageSwitcherModal from '../components/LanguageSwitcherModal';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (snap.exists() && snap.data()?.name) setName(snap.data()!.name);
      })
      .catch(() => {});
  }, []);

  const logout = () => {
    Alert.alert(t('settings.logoutTitle'), t('settings.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await auth.signOut();
            navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
          } catch (err: any) {
            setSigningOut(false);
            Alert.alert(t('common.error'), err.message ?? t('common.pleaseTryAgain'));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.header} edges={['top', 'left', 'right']}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.black} />
        </Pressable>
        <Text style={typography.h3}>{t('settings.title')}</Text>
        <View style={styles.backButton} />
      </SafeAreaView>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(name || 'R').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={typography.h3}>{name || t('settings.rider')}</Text>
          <Text style={[typography.caption, { color: colors.gray600 }]}>
            {auth.currentUser?.phoneNumber ?? ''}
          </Text>
        </View>
      </View>

      <View style={styles.group}>
        <Pressable style={styles.row} onPress={() => setLanguageOpen(true)}>
          <Ionicons name="language-outline" size={20} color={colors.black} />
          <Text style={[typography.body, { flex: 1 }]}>{t('settings.language')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
        </Pressable>
      </View>

      <View style={styles.group}>
        <Pressable style={styles.row}>
          <Ionicons name="help-circle-outline" size={20} color={colors.black} />
          <Text style={[typography.body, { flex: 1 }]}>{t('settings.helpSupport')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
        </Pressable>
        <Pressable style={styles.row}>
          <Ionicons name="document-text-outline" size={20} color={colors.black} />
          <Text style={[typography.body, { flex: 1 }]}>{t('settings.termsPolicy')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
        </Pressable>
        <Pressable style={styles.row}>
          <Ionicons name="information-circle-outline" size={20} color={colors.black} />
          <Text style={[typography.body, { flex: 1 }]}>{t('settings.about')}</Text>
          <Text style={[typography.caption, { color: colors.gray600 }]}>1.0.0</Text>
        </Pressable>
      </View>

      <Pressable style={styles.logoutButton} onPress={logout} disabled={signingOut}>
        {signingOut ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={[typography.bodyBold, { color: colors.danger }]}>{t('settings.logout')}</Text>
        )}
      </Pressable>

      <LanguageSwitcherModal visible={languageOpen} onClose={() => setLanguageOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    margin: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: radius.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: 24, fontWeight: '800' },
  group: { marginHorizontal: spacing.md, backgroundColor: colors.gray50, borderRadius: radius.lg, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  logoutButton: {
    marginHorizontal: spacing.md,
    backgroundColor: '#F3D9D9',
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
});
