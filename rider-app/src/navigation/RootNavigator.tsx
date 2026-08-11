import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import SetDestinationScreen from '../screens/SetDestinationScreen';
import ChooseRideScreen from '../screens/ChooseRideScreen';
import SearchingOffersScreen from '../screens/SearchingOffersScreen';
import ChooseDriverScreen from '../screens/ChooseDriverScreen';
import TripInProgressScreen from '../screens/TripInProgressScreen';
import RateDriverScreen from '../screens/RateDriverScreen';
import TripHistoryScreen from '../screens/TripHistoryScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';

export type PlaceParam = { label: string; lat: number; lng: number };

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Home: undefined;
  SetDestination: { pickup: PlaceParam; initialRideTypeId?: string };
  ChooseRide: { pickup: PlaceParam; destination: PlaceParam; initialRideTypeId?: string };
  SearchingOffers: {
    rideId: string;
    fare: number;
    rideTypeName: string;
    pickup: PlaceParam;
    destination: PlaceParam;
    minimumFare: number;
    autoAccept: boolean;
  };
  ChooseDriver: { rideId: string };
  TripInProgress: { rideId: string; driverName: string; fare: number };
  RateDriver: { rideId: string; driverName: string };
  TripHistory: undefined;
  Settings: undefined;
  Chat: { rideId: string; otherPartyName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="SetDestination" component={SetDestinationScreen} />
        <Stack.Screen name="ChooseRide" component={ChooseRideScreen} />
        <Stack.Screen name="SearchingOffers" component={SearchingOffersScreen} />
        <Stack.Screen name="ChooseDriver" component={ChooseDriverScreen} />
        <Stack.Screen name="TripInProgress" component={TripInProgressScreen} />
        <Stack.Screen name="RateDriver" component={RateDriverScreen} />
        <Stack.Screen name="TripHistory" component={TripHistoryScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
