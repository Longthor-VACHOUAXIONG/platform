import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorOverlay from './src/components/ErrorOverlay';
import RootNavigator from './src/navigation/RootNavigator';
import { restoreSavedLanguage } from './src/i18n';
import { colors } from './src/theme/theme';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreSavedLanguage().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <ErrorOverlay>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
          <ActivityIndicator color={colors.black} />
        </View>
      </ErrorOverlay>
    );
  }

  return (
    <ErrorOverlay>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SafeAreaProvider>
    </ErrorOverlay>
  );
}
