import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Linking
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';

export default function ClientDirectoryScreen({ navigation }) {
  const { colors } = useTheme();
  const [clients, setClients] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function fetchClients() {
    setRefreshing(true);
    const { data, error } = await supabase.rpc('get_client_directory');
    if (!error && data) {
      setClients(data);
      setFiltered(data);
    }
    setRefreshing(false);
  }

  useEffect(() => { fetchClients(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(clients.filter(c =>
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.phone_number || '').includes(q)
    ));
  }, [search, clients]);

  const renderItem = ({ item }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.name, { color: colors.text }]}>{item.full_name || 'No Name'}</Text>
        {item.phone_number && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone_number}`)}>
            <Text style={[styles.phone, { color: colors.accent }]}>📞 {item.phone_number}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{item.total_visits || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Visits</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>${Number(item.total_spent || 0).toFixed(0)}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Spent</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{item.loyalty_punches || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Punches</Text>
        </View>
      </View>
      {item.last_visit && (
        <Text style={[styles.lastVisit, { color: colors.textSecondary }]}>
          Last visit: {new Date(item.last_visit).toLocaleDateString()}
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: colors.text }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Clients</Text>
        <View style={{ width: 50 }} />
      </View>

      <TextInput
        style={[styles.search, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
        placeholder="Search by name or phone..."
        placeholderTextColor={colors.textSecondary}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchClients} tintColor={colors.accent} />}
        contentContainerStyle={{ paddingBottom: 30 }}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>No clients found</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backText: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: 'bold' },
  search: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 15, marginBottom: 14 },
  card: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  name: { fontSize: 16, fontWeight: 'bold', flex: 1 },
  phone: { fontSize: 13, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 6 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: 'bold' },
  statLabel: { fontSize: 11, marginTop: 2 },
  lastVisit: { fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
});