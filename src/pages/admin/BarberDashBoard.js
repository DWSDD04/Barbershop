import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  RefreshControl, ScrollView
} from 'react-native';
import { supabase } from '../../../lib/supabase';

export default function BarberDashboard({ navigation }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [appointmentDates, setAppointmentDates] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [todayStats, setTodayStats] = useState({ count: 0, revenue: 0, nextTime: null });

  const monthNames = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();

  const calendarDays = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    calendarDays.push({ day: d, dateStr: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    calendarDays.push({ day: d, dateStr, isCurrentMonth: true, isToday: dateStr === todayStr, hasAppointments: appointmentDates.has(dateStr) });
  }
  const remaining = 42 - calendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    calendarDays.push({ day: d, dateStr: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, isCurrentMonth: false });
  }

  const fetchMonthAppointments = useCallback(async () => {
    setRefreshing(true);
    const first = new Date(year, month, 1).toISOString().split('T')[0];
    const last  = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('appointments')
      .select('start_time, status')
      .gte('start_time', `${first}T00:00:00Z`)
      .lte('start_time', `${last}T23:59:59Z`);

    if (error) { console.error(error); setRefreshing(false); return; }

    const dates = new Set();
    data?.forEach(a => {
      if (a.status !== 'cancelled') dates.add(a.start_time.split('T')[0]);
    });
    setAppointmentDates(dates);

    const { data: todayApps } = await supabase
      .from('appointments')
      .select('start_time, status, services(price)')
      .gte('start_time', `${todayStr}T00:00:00Z`)
      .lte('start_time', `${todayStr}T23:59:59Z`)
      .neq('status', 'cancelled');

    let revenue = 0;
    let nextTime = null;
    todayApps?.forEach(a => {
      revenue += a.services?.price || 0;
      const appTime = new Date(a.start_time);
      if (appTime > now && (!nextTime || appTime < new Date(nextTime))) {
        nextTime = appTime;
      }
    });

    setTodayStats({
      count: todayApps?.length || 0,
      revenue,
      nextTime: nextTime ? nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
    });

    setRefreshing(false);
  }, [year, month, todayStr]);

  useEffect(() => { fetchMonthAppointments(); }, [fetchMonthAppointments]);

  const renderDay = ({ item }) => {
    const isPast = item.dateStr < todayStr;
    return (
      <TouchableOpacity
        style={[
          styles.dayCell,
          !item.isCurrentMonth && styles.dayMuted,
          item.isToday && styles.dayToday,
          isPast && styles.dayPast
        ]}
        onPress={() => {
          if (!item.isCurrentMonth || isPast) return;
          navigation.navigate('DaySchedule', { date: item.dateStr });
        }}
        activeOpacity={item.isCurrentMonth && !isPast ? 0.6 : 1}
      >
        <Text style={[
          styles.dayNum,
          !item.isCurrentMonth && styles.dayNumMuted,
          item.isToday && styles.dayNumToday,
          isPast && styles.dayNumPast
        ]}>
          {item.day}
        </Text>
        {item.hasAppointments && <View style={[styles.dot, item.isToday && styles.dotToday]} />}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchMonthAppointments} tintColor="#000000" />}
    >
      <View style={styles.header}>
  <Text style={styles.title}>Schedule</Text>
  <View style={styles.headerButtons}>
    <TouchableOpacity style={[styles.settingsButton, styles.btnMargin]} onPress={() => navigation.navigate('Analytics')}>
      <Text style={styles.settingsButtonText}>📊 Analytics</Text>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.settingsButton, styles.btnMargin]} onPress={() => navigation.navigate('ClientDirectory')}>
      <Text style={styles.settingsButtonText}>👥 Clients</Text>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.settingsButton, styles.btnMargin]} onPress={() => navigation.navigate('ManageServices')}>
      <Text style={styles.settingsButtonText}>Edit Menu</Text>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.settingsButton, styles.btnMargin]} onPress={() => navigation.navigate('ManageLocation')}>
      <Text style={styles.settingsButtonText}>📍 Location</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
      <Text style={styles.signOutButtonText}>Sign Out</Text>
    </TouchableOpacity>
  </View>
</View>

      <View style={styles.overviewCard}>
        <Text style={styles.overviewTitle}>Today</Text>
        <View style={styles.overviewRow}>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>{todayStats.count}</Text>
            <Text style={styles.overviewLabel}>Appointments</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>${todayStats.revenue.toFixed(0)}</Text>
            <Text style={styles.overviewLabel}>Revenue</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>{todayStats.nextTime || '—'}</Text>
            <Text style={styles.overviewLabel}>Next Cut</Text>
          </View>
        </View>
      </View>

      <View style={styles.calendarWrap}>
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month - 1, 1))} style={styles.arrow}>
            <Text style={styles.arrowText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.monthText}>{monthNames[month]} {year}</Text>
          <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month + 1, 1))} style={styles.arrow}>
            <Text style={styles.arrowText}>→</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dayNamesRow}>
          {dayNames.map(d => <Text key={d} style={styles.dayName}>{d}</Text>)}
        </View>

        <FlatList
          data={calendarDays}
          renderItem={renderDay}
          keyExtractor={(_, i) => i.toString()}
          numColumns={7}
          scrollEnabled={false}
        />
      </View>

      <Text style={styles.hint}>Black dot = has bookings • Tap a day to view slots</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#000000', marginRight: 12 },
  headerButtons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' },
  settingsButton: { backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5E5E5' },
  btnMargin: { marginRight: 8, marginBottom: 4 },
  settingsButtonText: { color: '#000000', fontWeight: 'bold', fontSize: 14 },
  signOutButton: { backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#C62828', marginBottom: 4 },
  signOutButtonText: { color: '#C62828', fontWeight: 'bold', fontSize: 14 },

  overviewCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 20, 
    borderWidth: 1, 
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  overviewTitle: { color: '#000000', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  overviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overviewItem: { flex: 1, alignItems: 'center' },
  overviewValue: { color: '#1A1A1A', fontSize: 22, fontWeight: 'bold' },
  overviewLabel: { color: '#666666', fontSize: 11, marginTop: 4 },
  overviewDivider: { width: 1, height: 30, backgroundColor: '#E5E5E5' },

  calendarWrap: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 12, 
    padding: 14, 
    borderWidth: 1, 
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  monthText: { color: '#1A1A1A', fontSize: 18, fontWeight: 'bold' },
  arrow: { padding: 6 },
  arrowText: { color: '#000000', fontSize: 22, fontWeight: 'bold' },
  dayNamesRow: { flexDirection: 'row', marginBottom: 6 },
  dayName: { flex: 1, textAlign: 'center', color: '#666666', fontSize: 11, fontWeight: '600' },

  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginBottom: 4 },
  dayMuted: { opacity: 0.25 },
  dayToday: { backgroundColor: '#000000' },
  dayPast: { opacity: 0.35 },
  dayNum: { color: '#1A1A1A', fontSize: 14, fontWeight: '500' },
  dayNumMuted: { color: '#999999' },
  dayNumToday: { color: '#FFFFFF', fontWeight: 'bold' },
  dayNumPast: { color: '#999999' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#000000', marginTop: 3 },
  dotToday: { backgroundColor: '#FFFFFF' },

  hint: { color: '#999999', fontSize: 12, textAlign: 'center', marginTop: 14 },
});