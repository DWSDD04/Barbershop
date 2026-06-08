import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  Alert
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';

export default function MessagesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [messages, setMessages] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadUserAndMessages();
  }, []);

  async function loadUserAndMessages() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) fetchMessages(user.id);
  }

  async function fetchMessages(userId) {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id, title, body, type, is_read, created_at, target_date,
        appointment_id,
        appointments(start_time, status, services(name, price, duration_minutes))
      `)
      .or(`recipient_id.eq.${userId},recipient_id.is.null`)
      .order('created_at', { ascending: false });

    if (error) Alert.alert('Error', error.message);
    else setMessages(data || []);
    setRefreshing(false);
  }

  async function markAsRead(messageId) {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('id', messageId);
    if (!error) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_read: true } : m));
    }
  }

  async function markAllAsRead() {
    const unreadIds = messages.filter(m => !m.is_read).map(m => m.id);
    if (unreadIds.length === 0) return;
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .in('id', unreadIds);
    if (!error) {
      setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
    }
  }

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item }) => {
    const isUnread = !item.is_read;
    const isCancellation = item.type === 'cancellation';
    const isDayOff = item.type === 'day_off';
    const hasAppointment = !!item.appointments;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: isUnread ? colors.card : (isDark ? '#111111' : '#F7F7F7'),
            borderColor: isUnread ? colors.accent : colors.border,
            borderWidth: isUnread ? 2 : 1,
          }
        ]}
        onPress={() => markAsRead(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, {
            backgroundColor: isCancellation ? colors.danger : isDayOff ? '#D4A017' : colors.accent
          }]}>
            <Text style={styles.typeBadgeText}>
              {isCancellation ? 'CANCELLED' : isDayOff ? 'DAY OFF' : 'NOTICE'}
            </Text>
          </View>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(item.created_at)}</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>

        {hasAppointment && (
          <View style={[styles.apptBox, { backgroundColor: isDark ? '#222222' : '#F2F2F2', borderColor: colors.border }]}>
            <Text style={[styles.apptLabel, { color: colors.textSecondary }]}>RELATED APPOINTMENT</Text>
            <Text style={[styles.apptText, { color: colors.text }]}>
              {item.appointments.services?.name || 'Appointment'}
            </Text>
            <Text style={[styles.apptMeta, { color: colors.textSecondary }]}>
              {new Date(item.appointments.start_time).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </Text>
            <View style={[styles.statusBadge, {
              backgroundColor: item.appointments.status === 'cancelled' ? colors.danger : colors.accent
            }]}>
              <Text style={styles.statusBadgeText}>{item.appointments.status.toUpperCase()}</Text>
            </View>
          </View>
        )}

        {item.target_date && !hasAppointment && (
          <View style={[styles.apptBox, { backgroundColor: isDark ? '#222222' : '#F2F2F2', borderColor: colors.border }]}>
            <Text style={[styles.apptLabel, { color: colors.textSecondary }]}>AFFECTED DATE</Text>
            <Text style={[styles.apptText, { color: colors.text }]}>
              {new Date(item.target_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
        )}

        {isUnread && (
          <View style={styles.unreadDot} />
        )}
      </TouchableOpacity>
    );
  };

  const unreadCount = messages.filter(m => !m.is_read).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: colors.text }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Messages {unreadCount > 0 && `(${unreadCount})`}
        </Text>
        <TouchableOpacity onPress={markAllAsRead}>
          <Text style={[styles.markAllText, { color: colors.accent }]}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchMessages(user?.id)} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No messages yet.</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              When the barber sends updates, they will appear here.
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 60 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backText: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },
  markAllText: { fontSize: 13, fontWeight: '600' },

  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    position: 'relative',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  dateText: { fontSize: 12, fontWeight: '500' },
  title: { fontSize: 17, fontWeight: 'bold', marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 10 },

  apptBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  apptLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  apptText: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  apptMeta: { fontSize: 12, marginBottom: 6 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },

  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },

  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 30 },
});