import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './lib/supabase';
import { ThemeProvider } from './src/context/ThemeContext';

import LoginScreen from './src/pages/auth/LoginScreen';
import SignUpScreen from './src/pages/auth/SignUpScreen';
import ClientHomeScreen from './src/pages/client/ClientHomeScreen';
import BookingScreen from './src/pages/client/BookingScreen';
import MessagesScreen from './src/pages/client/MessagesScreen';
import BarberDashboard from './src/pages/admin/BarberDashBoard';
import DayScheduleScreen from './src/pages/admin/DayScheduleScreen';
import ManageServicesScreen from './src/pages/admin/ManageServicesScreen';
import ManageLocationScreen from './src/pages/admin/ManageLocationScreen';
import AnalyticsScreen from './src/pages/admin/AnalyticsScreen';
import ClientDirectoryScreen from './src/pages/admin/ClientDirectoryScreen';
import AIChatScreen from './src/pages/client/AIChatScreen';

const Stack = createNativeStackNavigator();

export default function App() {
 const [isLoading, setIsLoading] = useState(true);
 const [session, setSession] = useState(null);
 const [isAdmin, setIsAdmin] = useState(false);

 useEffect(() => {
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
 try {
 const { data, error } = await supabase
 .from('profiles')
 .select('is_admin')
 .eq('id', currentSession.user.id)
 .single();
 if (!error && data) setIsAdmin(data.is_admin);
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
 <ActivityIndicator size="large" color="#000000" />
 </View>
 );
 }

 return (
 <ThemeProvider>
 <NavigationContainer>
 <Stack.Navigator screenOptions={{ headerShown: false }}>
 {session == null ? (
 <>
 <Stack.Screen name="Login" component={LoginScreen} />
 <Stack.Screen name="SignUp" component={SignUpScreen} />
 </>
 ) : isAdmin ? (
 <>
 <Stack.Screen name="BarberDashboard" component={BarberDashboard} />
 <Stack.Screen name="DaySchedule" component={DayScheduleScreen} />
 <Stack.Screen name="ManageServices" component={ManageServicesScreen} />
 <Stack.Screen name="ManageLocation" component={ManageLocationScreen} />
 <Stack.Screen name="Analytics" component={AnalyticsScreen} />
 <Stack.Screen name="ClientDirectory" component={ClientDirectoryScreen} />
 </>
 ) : (
 <>
 <Stack.Screen name="ClientHome" component={ClientHomeScreen} />
 <Stack.Screen name="BookAppointment" component={BookingScreen} />
 <Stack.Screen name="Messages" component={MessagesScreen} />
 <Stack.Screen name="AIChat" component={AIChatScreen} options={{ headerShown: false }} />
 </>
 )}
 </Stack.Navigator>
 </NavigationContainer>
 </ThemeProvider>
 );
}

const styles = StyleSheet.create({
 loadingContainer: {
 flex: 1,
 backgroundColor: '#F2F2F2',
 justifyContent: 'center',
 alignItems: 'center',
 },
});