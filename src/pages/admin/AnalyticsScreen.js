import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  RefreshControl, Dimensions
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');

export default function AnalyticsScreen({ navigation }) {
  const { colors } = useTheme();
  const [range, setRange] = useState('week');
  const [stats, setStats] = useState({ total_revenue: 0, total_appointments: 0, avg_rating: 0, unique_clients: 0 });
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [recentReviews, setRecentReviews] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // AI Review Summary state
  const [aiSummary, setAiSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  async function generateSummary() {
  setSummaryLoading(true);
  try {
    const now = new Date();
    let startDate;
    if (range === "today") {
      startDate = now.toISOString().split("T")[0];
    } else if (range === "week") {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      startDate = d.toISOString().split("T")[0];
    } else {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      startDate = d.toISOString().split("T")[0];
    }

    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating, comment, created_at, appointments(services(name)), profiles(full_name)")
      .gte("created_at", `${startDate}T00:00:00Z`)
      .order("created_at", { ascending: false });

    if (!reviews || reviews.length === 0) {
      setAiSummary("No reviews in this period yet.");
      setSummaryLoading(false);
      return;
    }

    const reviewsList = reviews.map(r => {
      const date = new Date(r.created_at).toLocaleDateString();
      const comment = r.comment ? `: "${r.comment}"` : ' (no comment)';
      return `- ${r.rating}/5 stars${comment} | Service: ${r.appointments?.services?.name || 'Unknown'} | ${date}`;
    }).join('\n');

    const systemPrompt = `You are a business analytics assistant for a barbershop. Summarize client reviews into actionable insights.

REVIEWS:
${reviewsList}

Provide: 1) Overall sentiment 2) Top 2 things clients love 3) Top 1-2 areas for improvement 4) One actionable tip. Keep under 4 sentences.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer gsk_YOUR_GROQ_API_KEY_HERE', // <-- REPLACE
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Summarize these reviews.' },
        ],
        temperature: 0.5,
        max_tokens: 400,
      }),
    });

    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const data = await response.json();
    setAiSummary(data.choices?.[0]?.message?.content || "Couldn't generate summary.");
  } catch (err) {
    console.log('Summary error:', err);
    setAiSummary("Error: " + (err.message || "Couldn't generate summary."));
  } finally {
    setSummaryLoading(false);
  }
}

  const fetchAnalytics = useCallback(async () => {
    setRefreshing(true);
    const now = new Date();
    let start, end;
    if (range === 'today') {
      start = end = now.toISOString().split('T')[0];
    } else if (range === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      start = d.toISOString().split('T')[0];
      end = now.toISOString().split('T')[0];
    } else {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      start = d.toISOString().split('T')[0];
      end = now.toISOString().split('T')[0];
    }

    const { data: summary } = await supabase.rpc('get_analytics_summary', {
      start_date: start,
      end_date: end
    });
    if (summary?.[0]) setStats(summary[0]);

    const { data: daily } = await supabase
      .from('appointments')
      .select('start_time, services(price)')
      .eq('status', 'completed')
      .gte('start_time', `${start}T00:00:00Z`)
      .lte('start_time', `${end}T23:59:59Z`)
      .order('start_time', { ascending: true });

    const revMap = {};
    daily?.forEach(d => {
      const date = d.start_time.split('T')[0];
      revMap[date] = (revMap[date] || 0) + (d.services?.price || 0);
    });
    setDailyRevenue(Object.entries(revMap).map(([date, revenue]) => ({ date, revenue })));

    const { data: reviews } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at, profiles(full_name), appointments(start_time, services(name))')
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentReviews(reviews || []);

    setRefreshing(false);
  }, [range]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const maxRev = Math.max(...dailyRevenue.map(d => d.revenue), 1);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchAnalytics} tintColor={colors.accent} />}>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: colors.text }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Analytics</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* AI Review Summary Card */}
      <TouchableOpacity 
        style={[styles.aiCard, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={generateSummary}
        disabled={summaryLoading}
      >
        <Text style={[styles.aiCardTitle, { color: colors.text }]}>
          🤖 AI Insights {summaryLoading && '...'}
        </Text>
        {aiSummary ? (
          <Text style={[styles.aiCardBody, { color: colors.text }]}>{aiSummary}</Text>
        ) : (
          <Text style={[styles.aiCardHint, { color: colors.text + '88' }]}>
            Tap to analyze reviews from this period
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.rangeRow}>
        {['today', 'week', 'month'].map(r => (
          <TouchableOpacity key={r} onPress={() => setRange(r)}
            style={[styles.rangeBtn, { borderColor: colors.border }, range === r && { backgroundColor: colors.accent }]}>
            <Text style={[styles.rangeText, { color: range === r ? colors.card : colors.textSecondary }]}>
              {r === 'today' ? 'Today' : r === 'week' ? '7 Days' : '30 Days'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.grid}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>${Number(stats.total_revenue || 0).toFixed(0)}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Revenue</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{stats.total_appointments || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Cuts</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{Number(stats.avg_rating || 0).toFixed(1)}★</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{stats.unique_clients || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Clients</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Revenue Trend</Text>
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {dailyRevenue.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No data yet</Text>
        ) : (
          <View style={styles.chartRow}>
            {dailyRevenue.map((d, i) => (
              <View key={i} style={styles.barWrap}>
                <View style={[styles.bar, { height: Math.max((d.revenue / maxRev) * 120, 4), backgroundColor: colors.accent }]} />
                <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{d.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Reviews</Text>
      {recentReviews.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>No reviews yet</Text>
      ) : (
        recentReviews.map(r => (
          <View key={r.id} style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.reviewHeader}>
              <Text style={[styles.reviewName, { color: colors.text }]}>{r.profiles?.full_name || 'Client'}</Text>
              <Text style={[styles.reviewRating, { color: '#FFD700' }]}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
            </View>
            <Text style={[styles.reviewService, { color: colors.textSecondary }]}>{r.appointments?.services?.name}</Text>
            {r.comment ? <Text style={[styles.reviewComment, { color: colors.textSecondary }]}>{r.comment}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  backText: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: 'bold' },
  aiCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  aiCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  aiCardBody: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  aiCardHint: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  rangeRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  rangeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  rangeText: { fontWeight: '600', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: { width: (width - 60) / 2, padding: 14, borderRadius: 10, borderWidth: 1 },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20, marginBottom: 12 },
  chartCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 20 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140, paddingTop: 10 },
  barWrap: { flex: 1, alignItems: 'center' },
  bar: { width: 8, borderRadius: 4 },
  barLabel: { fontSize: 9, marginTop: 6 },
  empty: { textAlign: 'center', paddingVertical: 20, fontStyle: 'italic' },
  reviewCard: { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 10 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  reviewName: { fontWeight: 'bold', fontSize: 14 },
  reviewRating: { fontSize: 14 },
  reviewService: { fontSize: 12, marginBottom: 4 },
  reviewComment: { fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
});