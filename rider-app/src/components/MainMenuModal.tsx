import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '../theme/theme';
import LanguageSwitcherModal from './LanguageSwitcherModal';

export default function MainMenuModal({
  visible,
  onClose,
  onOpenTripHistory,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenTripHistory: () => void;
}) {
  const { t } = useTranslation();
  const [languageOpen, setLanguageOpen] = useState(false);

  return (
    <>
      <Modal visible={visible && !languageOpen} transparent animationType="slide">
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Pressable
            style={styles.row}
            onPress={() => {
              onClose();
              onOpenTripHistory();
            }}
          >
            <Ionicons name="time-outline" size={20} color={colors.black} />
            <Text style={typography.body}>{t('tripHistory.title')}</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => setLanguageOpen(true)}>
            <Ionicons name="language-outline" size={20} color={colors.black} />
            <Text style={typography.body}>{t('settings.language')}</Text>
          </Pressable>
        </View>
      </Modal>

      <LanguageSwitcherModal
        visible={languageOpen}
        onClose={() => {
          setLanguageOpen(false);
          onClose();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
});
