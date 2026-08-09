import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, typography } from '../theme/theme';
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '../i18n';

export default function LanguageSwitcherModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={typography.h3}>{t('settings.language')}</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.black} />
          </Pressable>
        </View>

        {SUPPORTED_LANGUAGES.map((lang) => (
          <Pressable
            key={lang.code}
            style={styles.row}
            onPress={async () => {
              await setLanguage(lang.code as LanguageCode);
              onClose();
            }}
          >
            <Text style={typography.body}>{lang.label}</Text>
            {i18n.language === lang.code && (
              <Ionicons name="checkmark" size={20} color={colors.black} />
            )}
          </Pressable>
        ))}
      </View>
    </Modal>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
});
