import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../../../lib/supabase';

// Import your screens
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import ClientHomeScreen from './screens/client/ClientHomeScreen';
import BookingScreen from './screens/client/BookingScreen';
import BarberDashboard from './screens/admin/BarberDashboard';
import ManageServicesScreen from './screens/admin/ManageServicesScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // 1. Listen for auth changes (Login, Logout, Session updates)
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleUserSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleUserSession(currentSession) {
    setSession(currentSession);
    
    if (currentSession?.user) {
      // Fetch role from the profiles table
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', currentSession.user.id)
          .single();

        if (!error && data) {
          setIsAdmin(data.is_admin);
        }
      } catch (err) {
        console.error("Error fetching role: ", err);
      }
    } else {
      setIsAdmin(false);
    }
    setIsLoading(false);
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E5A93C" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session == null ? (
          // --- AUTH FLOW ---
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        ) : isAdmin ? (
          // --- BARBER (ADMIN) FLOW ---
          <>
            <Stack.Screen name="BarberHome" component={BarberDashboard} />
            <Stack.Screen name="ManageServices" component={ManageServicesScreen} />
          </>
        ) : (
          // --- CLIENT FLOW ---
          <>
            <Stack.Screen name="ClientHome" component={ClientHomeScreen} />
            <Stack.Screen name="BookAppointment" component={BookingScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
});