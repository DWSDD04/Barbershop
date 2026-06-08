import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../../../lib/supabase';

export default function SignUpScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate() {
    const name = fullName.trim();
    if (!name || name.length < 2) {
      Alert.alert('Invalid Name', 'Please enter your full name (at least 2 characters).');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return false;
    }

    if (!password || password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return false;
    }

    return true;
  }

  async function signUpNewUser() {
    if (!validate()) return;

    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone_number: phone.trim() || null,
        },
      },
    });

    setLoading(false);

    if (authError) {
      Alert.alert('Sign Up Error', authError.message);
    } else {
      Alert.alert(
        'Account Created',
        'Check your email for a confirmation link before signing in.',
        [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }]
      );
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join the club and book your first cut.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#999999"
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            textContentType="name"
          />

          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="#999999"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            style={styles.input}
            placeholder="Phone Number (Optional)"
            placeholderTextColor="#999999"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            value={phone}
            onChangeText={setPhone}
          />

          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password (min 6 chars)"
              placeholderTextColor="#999999"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={signUpNewUser} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Register</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.linkHighlight}>Sign In</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start' },
  backText: { color: '#000000', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#000000', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#888888', marginBottom: 32 },
  form: { width: '100%' },
  input: {
    backgroundColor: '#FFFFFF',
    color: '#1A1A1A',
    padding: 16,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    fontSize: 15,
  },
  passwordWrap: { position: 'relative', marginBottom: 14 },
  passwordInput: { marginBottom: 0, paddingRight: 50 },
  eyeBtn: { position: 'absolute', right: 12, top: 14, padding: 4 },
  eyeText: { fontSize: 18, color: '#666666' },
  button: {
    backgroundColor: '#000000',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  link: { marginTop: 24, alignItems: 'center' },
  linkText: { color: '#888888', fontSize: 14 },
  linkHighlight: { color: '#000000', fontWeight: '600' },
});