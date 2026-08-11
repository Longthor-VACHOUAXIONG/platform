import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import TripAwaitingAcceptanceScreen from '../screens/TripAwaitingAcceptanceScreen';
import TripInProgressScreen from '../screens/TripInProgressScreen';
import RateRiderScreen from '../screens/RateRiderScreen';
import TripHistoryScreen from '../screens/TripHistoryScreen';
import ChatScreen from '../screens/ChatScreen';
import WalletScreen from '../screens/WalletScreen';
import TopUpScreen from '../screens/TopUpScreen';
import SettingsScreen from '../screens/SettingsScreen';

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Home: undefined;
  TripAwaitingAcceptance: { rideId: string };
  TripInProgress: { rideId: string };
  RateRider: { rideId: string };
  TripHistory: undefined;
  Chat: { rideId: string; otherPartyName: string };
  Wallet: undefined;
  TopUp: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="TripAwaitingAcceptance" component={TripAwaitingAcceptanceScreen} />
        <Stack.Screen name="TripInProgress" component={TripInProgressScreen} />
        <Stack.Screen name="RateRider" component={RateRiderScreen} />
        <Stack.Screen name="TripHistory" component={TripHistoryScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Wallet" component={WalletScreen} />
        <Stack.Screen name="TopUp" component={TopUpScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
