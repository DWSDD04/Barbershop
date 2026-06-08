import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  Alert, Linking, ScrollView
} from 'react-native';
import { supabase } from '../../../lib/supabase';

export default function ManageLocationScreen({ navigation }) {
  const [mapsUrl, setMapsUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState(null);
  const [recordId, setRecordId] = useState(null);

  useEffect(() => {
    fetchLocation();
  }, []);

  async function fetchLocation() {
    const { data, error } = await supabase
      .from('barber_settings')
      .select('id, maps_url')
      .maybeSingle();

    if (error) {
      console.error('Fetch location error:', error);
      return;
    }

    if (data) {
      setMapsUrl(data.maps_url || '');
      setSavedUrl(data.maps_url || null);
      setRecordId(data.id || null);
    }
  }

  async function saveLocation() {
    const trimmed = mapsUrl.trim();
    if (!trimmed) {
      Alert.alert('Missing URL', 'Please enter a Google Maps link.');
      return;
    }

    if (!trimmed.includes('google.com/maps') && !trimmed.includes('maps.app.goo.gl')) {
      Alert.alert('Invalid URL', 'Please paste a valid Google Maps link.');
      return;
    }

    let error = null;

    if (recordId) {
      // Update existing row by its real UUID
      const result = await supabase
        .from('barber_settings')
        .update({ maps_url: trimmed })
        .eq('id', recordId);
      error = result.error;
    } else {
      // Insert new row — let Supabase generate the UUID
      const result = await supabase
        .from('barber_settings')
        .insert([{ maps_url: trimmed }])
        .select('id, maps_url')
        .single();
      error = result.error;
      if (!error && result.data) {
        setRecordId(result.data.id);
      }
    }

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSavedUrl(trimmed);
      Alert.alert('Saved', 'Location updated successfully.');
    }
  }

  function openMaps() {
    if (savedUrl) Linking.openURL(savedUrl);
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error', error.message);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Shop Location</Text>

      <Text style={styles.label}>Google Maps Link</Text>
      <TextInput
        style={styles.input}
        placeholder="https://maps.google.com/..."
        placeholderTextColor="#999999"
        value={mapsUrl}
        onChangeText={setMapsUrl}
        autoCapitalize="none"
        keyboardType="url"
      />

      <TouchableOpacity style={styles.saveBtn} onPress={saveLocation}>
        <Text style={styles.saveBtnText}>Save Location</Text>
      </TouchableOpacity>

      {savedUrl && (
        <TouchableOpacity style={styles.openBtn} onPress={openMaps}>
          <Text style={styles.openBtnText}>📍 Open in Google Maps</Text>
        </TouchableOpacity>
      )}

      {/* Spacer pushes buttons to bottom on tall screens */}
      <View style={{ flex: 1 }} />

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#000000', marginBottom: 24 },
  label: { color: '#666666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  input: { backgroundColor: '#FFFFFF', color: '#1A1A1A', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#E5E5E5', fontSize: 15, marginBottom: 16 },
  saveBtn: { backgroundColor: '#000000', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  openBtn: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E5E5E5', marginBottom: 12 },
  openBtnText: { color: '#1A1A1A', fontWeight: 'bold', fontSize: 16 },
  backBtn: { paddingVertical: 10, marginBottom: 8 },
  backText: { color: '#666666', fontSize: 16, fontWeight: '600' },
  signOutBtn: { paddingVertical: 10, alignSelf: 'flex-start' },
  signOutText: { color: '#C62828', fontSize: 16, fontWeight: '600' },
});