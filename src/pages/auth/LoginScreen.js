import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../../../lib/supabase';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return false;
    }
    if (!password || password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return false;
    }
    return true;
  }

  async function signInWithEmail() {
    if (!validate()) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    if (error) {
      Alert.alert('Authentication Error', error.message);
      setLoading(false);
      return;
    }

    // Do NOT navigate manually here.
    // The onAuthStateChange listener in App.js detects the new session
    // and automatically re-renders with the correct stack (Barber or Client).
    // The loading spinner will show until App.js unmounts this screen.
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.headerContainer}>
          <Text style={styles.logoText}>THE BARBER</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitleText}>Book your next look instantly</Text>
        </View>

        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="#999999"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />

          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor="#999999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textContentType="password"
              autoComplete="password"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={signInWithEmail} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.linkContainer}>
            <Text style={styles.linkText}>New client? <Text style={styles.linkHighlight}>Create an account</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  headerContainer: { alignItems: 'center', marginBottom: 40 },
  logoText: { fontSize: 38, fontWeight: 'bold', color: '#000000', letterSpacing: 3 },
  divider: { width: 40, height: 2, backgroundColor: '#000000', marginVertical: 12, borderRadius: 1 },
  subtitleText: { fontSize: 14, color: '#888888' },
  formContainer: { width: '100%' },
  input: {
    backgroundColor: '#FFFFFF',
    color: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  passwordWrap: { position: 'relative', marginBottom: 14 },
  passwordInput: { marginBottom: 0, paddingRight: 50 },
  eyeBtn: { position: 'absolute', right: 12, top: 12, padding: 4 },
  eyeText: { fontSize: 18, color: '#666666' },
  button: {
    backgroundColor: '#000000',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  linkContainer: { alignItems: 'center', marginTop: 24 },
  linkText: { color: '#888888', fontSize: 14 },
  linkHighlight: { color: '#000000', fontWeight: '600' },
});