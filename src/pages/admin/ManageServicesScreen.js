import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, RefreshControl
} from 'react-native';
import { supabase } from '../../../lib/supabase';

export default function ManageServicesScreen({ navigation }) {
  const [services, setServices] = useState([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => { fetchServices(); }, []);

  async function fetchServices() {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setServices(data || []);
    }
    setRefreshing(false);
  }

  function validateInputs() {
    const trimmedName = name.trim();
    if (!trimmedName) return { valid: false, msg: 'Service name is required' };
    if (trimmedName.length < 2) return { valid: false, msg: 'Name is too short' };

    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) return { valid: false, msg: 'Price must be a positive number' };

    const d = parseInt(duration);
    if (isNaN(d) || d <= 0) return { valid: false, msg: 'Duration must be at least 1 minute' };

    return {
      valid: true,
      name: trimmedName,
      price: p,
      duration: d,
      description: description.trim() || null,
    };
  }

  async function addService() {
    const check = validateInputs();
    if (!check.valid) {
      Alert.alert('Invalid Input', check.msg);
      return;
    }

    setAdding(true);
    const { error } = await supabase.from('services').insert([{
      name: check.name,
      price: check.price,
      duration_minutes: check.duration,
      is_active: true,
      description: check.description,
    }]);

    setAdding(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setName('');
      setPrice('');
      setDuration('');
      setDescription('');
      fetchServices();
    }
  }

  async function toggleService(id, currentStatus) {
    setLoading(id);
    const { error } = await supabase
      .from('services')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      fetchServices();
    }
  }

  async function deleteService(id, serviceName) {
    Alert.alert(
      'Delete Service',
      `Remove "${serviceName}" from the menu permanently?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(id);
            const { error } = await supabase.from('services').delete().eq('id', id);
            setLoading(false);
            if (error) Alert.alert('Error', error.message);
            else fetchServices();
          },
        },
      ]
    );
  }

  const renderItem = ({ item }) => {
    const isProcessing = loading === item.id;

    return (
      <View style={[styles.serviceItem, !item.is_active && styles.serviceItemHidden]}>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName}>{item.name}</Text>
          <Text style={styles.serviceDetails}>
            ${item.price.toFixed(2)} • {item.duration_minutes} mins
          </Text>
          {item.description ? (
            <Text style={styles.serviceDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          {!item.is_active && <Text style={styles.hiddenLabel}>HIDDEN FROM CLIENTS</Text>}
        </View>

        <View style={styles.serviceActions}>
          <TouchableOpacity
            style={[styles.toggleBtn, { backgroundColor: item.is_active ? '#000000' : '#666666' }]}
            onPress={() => toggleService(item.id, item.is_active)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.toggleText}>{item.is_active ? 'Active' : 'Hidden'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => deleteService(item.id, item.name)}
            disabled={isProcessing}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Menu</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.addForm}>
        <Text style={styles.formLabel}>Add New Service</Text>
        <TextInput
          style={styles.input}
          placeholder="Service Name (e.g. Skin Fade)"
          placeholderTextColor="#999999"
          value={name}
          onChangeText={setName}
          maxLength={40}
        />
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          placeholder="Description (optional)"
          placeholderTextColor="#999999"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          maxLength={200}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Price ($)"
            placeholderTextColor="#999999"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Minutes"
            placeholderTextColor="#999999"
            keyboardType="number-pad"
            value={duration}
            onChangeText={setDuration}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={addService} disabled={adding}>
          {adding ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.addButtonText}>Add to Menu</Text>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={services}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchServices} tintColor="#000000" />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No services yet.</Text>
            <Text style={styles.emptySub}>Add your first cut above.</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2', padding: 20, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: { paddingVertical: 4, minWidth: 50 },
  backText: { color: '#000000', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#000000' },

  addForm: {
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  formLabel: {
    color: '#666666',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    backgroundColor: '#FFFFFF',
    color: '#1A1A1A',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  addButton: {
    backgroundColor: '#000000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: { fontWeight: 'bold', color: '#FFFFFF', fontSize: 15 },

  serviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  serviceItemHidden: {
    opacity: 0.6,
    borderColor: '#CCCCCC',
  },
  serviceInfo: { flex: 1, marginRight: 12 },
  serviceName: { color: '#1A1A1A', fontWeight: 'bold', fontSize: 16 },
  serviceDetails: { color: '#666666', fontSize: 13, marginTop: 4 },
  serviceDesc: { color: '#888888', fontSize: 12, marginTop: 4, lineHeight: 16 },
  hiddenLabel: {
    color: '#C62828',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  serviceActions: { alignItems: 'flex-end', gap: 6 },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  toggleText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  deleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  deleteText: { color: '#C62828', fontSize: 12, fontWeight: '600' },

  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#666666', fontSize: 16, fontWeight: '600' },
  emptySub: { color: '#999999', fontSize: 13, marginTop: 6 },
});