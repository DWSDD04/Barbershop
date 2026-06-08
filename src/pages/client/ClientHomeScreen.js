import React, { useEffect, useState } from 'react';
import {
 View, Text, StyleSheet, TouchableOpacity, FlatList,
 RefreshControl, Image, Alert, Linking, Modal, TextInput
} from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';

const STATUS_COLORS = {
 confirmed: '#1A1A1A',
 completed: '#666666',
 cancelled: '#C62828',
 pending: '#999999',
};

export default function ClientHomeScreen({ navigation }) {
 const { colors, isDark } = useTheme();
 const [appointments, setAppointments] = useState([]);
 const [refreshing, setRefreshing] = useState(false);
 const [user, setUser] = useState(null);
 const [mapsUrl, setMapsUrl] = useState(null);
 const [profile, setProfile] = useState(null);
 const [unreadCount, setUnreadCount] = useState(0);

 const [reviewModal, setReviewModal] = useState(false);
 const [reviewAppt, setReviewAppt] = useState(null);
 const [rating, setRating] = useState(5);
 const [reviewComment, setReviewComment] = useState('');

 useEffect(() => {
 loadUserAndAppointments();
 fetchMapsUrl();
 }, []);

 useEffect(() => {
 if (!user?.id) return;
 const interval = setInterval(() => {
 fetchMyAppointments(user.id);
 fetchUnreadCount(user.id);
 }, 10000);
 fetchMyAppointments(user.id);
 fetchUnreadCount(user.id);
 return () => clearInterval(interval);
 }, [user?.id]);

 async function loadUserAndAppointments() {
 const { data: { user } } = await supabase.auth.getUser();
 setUser(user);
 if (user) {
 fetchMyAppointments(user.id);
 fetchProfile(user.id);
 fetchUnreadCount(user.id);
 }
 }

 async function fetchProfile(userId) {
 const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
 if (data) setProfile(data);
 }

 async function fetchMyAppointments(userId) {
 setRefreshing(true);
 const { data, error } = await supabase
 .from('appointments')
 .select('id, start_time, status, client_notes, reference_image_url, service_id, services(name, price, duration_minutes, description)')
 .eq('client_id', userId)
 .order('start_time', { ascending: true });

 if (error) Alert.alert('Error', error.message);
 else {
 setAppointments(data || []);
 checkPendingReview(data || []);
 }
 setRefreshing(false);
 }

 async function fetchUnreadCount(userId) {
 const { count, error } = await supabase
 .from('messages')
 .select('id', { count: 'exact', head: true })
 .or(`recipient_id.eq.${userId},recipient_id.is.null`)
 .eq('is_read', false);
 if (!error) setUnreadCount(count || 0);
 }

 async function checkPendingReview(apps) {
 const completed = apps.filter(a => a.status === 'completed');
 for (const appt of completed) {
 const { data } = await supabase.from('reviews').select('id').eq('appointment_id', appt.id).maybeSingle();
 if (!data) {
 setReviewAppt(appt);
 setReviewModal(true);
 break;
 }
 }
 }

 async function submitReview() {
 if (!reviewAppt) return;
 const { error } = await supabase.from('reviews').insert({
 appointment_id: reviewAppt.id,
 client_id: user.id,
 rating,
 comment: reviewComment.trim() || null,
 });
 if (error) Alert.alert('Error', error.message);
 else {
 setReviewModal(false);
 setReviewAppt(null);
 setRating(5);
 setReviewComment('');
 }
 }

 async function fetchMapsUrl() {
 const { data, error } = await supabase.from('barber_settings').select('maps_url').maybeSingle();
 if (!error && data?.maps_url) setMapsUrl(data.maps_url);
 }

 async function cancelAppointment(id) {
 Alert.alert('Cancel Appointment', 'Are you sure? The barber will be notified.', [
 { text: 'Keep It', style: 'cancel' },
 {
 text: 'Cancel Booking', style: 'destructive',
 onPress: async () => {
 const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);
 if (error) Alert.alert('Error', error.message);
 else fetchMyAppointments(user.id);
 },
 },
 ]);
 }

 const formatDate = (iso) => {
 const d = new Date(iso);
 const now = new Date();
 const isToday = d.toDateString() === now.toDateString();
 const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
 const isTomorrow = d.toDateString() === tomorrow.toDateString();
 const datePart = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
 return `${datePart} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
 };

 const renderAppointment = ({ item }) => {
 const statusColor = STATUS_COLORS[item.status] || '#666666';
 const isUpcoming = item.status === 'confirmed' || item.status === 'pending';
 const isPastCompleted = item.status === 'completed';

 return (
 <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
 <View style={styles.cardHeader}>
 <Text style={[styles.cardTitle, { color: colors.text }]}>{item.services?.name || 'Unknown Service'}</Text>
 <View style={[styles.badge, { backgroundColor: statusColor }]}>
 <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
 </View>
 </View>
 <Text style={[styles.cardDate, { color: colors.text }]}>{formatDate(item.start_time)}</Text>
 <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
 {item.services?.price ? `$${item.services.price}` : ''}
 {item.services?.duration_minutes ? ` • ${item.services.duration_minutes} mins` : ''}
 </Text>

 {item.services?.description ? (
 <Text style={[styles.serviceDesc, { color: colors.textSecondary }]}>{item.services.description}</Text>
 ) : null}

 {item.client_notes && (
 <View style={[styles.noteBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
 <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>Your Notes</Text>
 <Text style={[styles.noteText, { color: colors.text }]}>{item.client_notes}</Text>
 </View>
 )}

 {item.reference_image_url && (
 <Image source={{ uri: item.reference_image_url }} style={styles.thumb} resizeMode="cover" />
 )}

 {isUpcoming && (
 <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.danger }]} onPress={() => cancelAppointment(item.id)}>
 <Text style={[styles.cancelText, { color: colors.danger }]}>Cancel Booking</Text>
 </TouchableOpacity>
 )}

 {isPastCompleted && (
 <TouchableOpacity style={[styles.rebookBtn, { backgroundColor: colors.accent }]} onPress={() => navigation.navigate('BookAppointment', {
 rebookServiceId: item.service_id,
 rebookNotes: item.client_notes
 })}>
 <Text style={[styles.rebookText, { color: '#FFFFFF' }]}>Book Again</Text>
 </TouchableOpacity>
 )}
 </View>
 );
 };

 const punches = profile?.loyalty_punches || 0;
 const punchesNeeded = 5 - (punches % 5);

 return (
 <View style={[styles.container, { backgroundColor: colors.bg }]}>
 <View style={styles.headerRow}>
 <Text style={[styles.title, { color: colors.text }]}>Your Appointments</Text>
 <View style={{ flexDirection: 'row', alignItems: 'center' }}>
 {/* AI Chat Button */}
 <TouchableOpacity
 style={styles.messagesBtn}
 onPress={() => navigation.navigate('AIChat')}
 >
 <Text style={styles.messagesBtnText}>🤖</Text>
 </TouchableOpacity>
 {/* Messages Button */}
 <TouchableOpacity
 style={styles.messagesBtn}
 onPress={() => navigation.navigate('Messages')}
 >
 <Text style={styles.messagesBtnText}>💬</Text>
 {unreadCount > 0 && (
 <View style={styles.badgeDot}>
 <Text style={styles.badgeDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
 </View>
 )}
 </TouchableOpacity>
 <TouchableOpacity onPress={() => supabase.auth.signOut()}>
 <Text style={[styles.logoutTop, { color: colors.danger }]}>Sign Out</Text>
 </TouchableOpacity>
 </View>
 </View>

 {/* Loyalty Card */}
 <View style={[styles.loyaltyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
 <Text style={[styles.loyaltyTitle, { color: colors.textSecondary }]}>Loyalty Card</Text>
 <View style={styles.punchRow}>
 {[1, 2, 3, 4, 5].map(i => (
 <View key={i} style={[styles.punchSlot, {
 backgroundColor: punches % 5 >= i ? colors.accent : isDark ? '#333' : '#E5E5E5',
 borderColor: colors.border
 }]}>
 {punches % 5 >= i && <Text style={styles.punchCheck}>✓</Text>}
 </View>
 ))}
 </View>
 <Text style={[styles.loyaltySub, { color: colors.textSecondary }]}>
 {punchesNeeded === 5 ? 'Redeem your free cut on next booking!' : `${punchesNeeded} more until free cut`}
 </Text>
 </View>

 {mapsUrl && (
 <TouchableOpacity style={[styles.locationBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => Linking.openURL(mapsUrl)}>
 <Text style={[styles.locationBtnText, { color: colors.text }]}>📍 Get Directions to Shop</Text>
 </TouchableOpacity>
 )}

 <FlatList
 data={appointments}
 keyExtractor={item => item.id}
 renderItem={renderAppointment}
 refreshControl={
 <RefreshControl refreshing={refreshing} onRefresh={() => user && fetchMyAppointments(user.id)} tintColor={colors.accent} />
 }
 ListEmptyComponent={
 <View style={styles.emptyBox}>
 <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No upcoming cuts scheduled.</Text>
 <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Tap below to book your first look.</Text>
 </View>
 }
 contentContainerStyle={{ paddingBottom: 12 }}
 />

 <TouchableOpacity style={[styles.bookButton, { backgroundColor: colors.accent }]} onPress={() => navigation.navigate('BookAppointment')}>
 <Text style={[styles.bookButtonText, { color: '#FFFFFF' }]}>Book a New Appointment</Text>
 </TouchableOpacity>

 {/* Review Modal */}
 <Modal visible={reviewModal} animationType="slide" transparent onRequestClose={() => setReviewModal(false)}>
 <View style={styles.overlay}>
 <View style={[styles.reviewSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
 <Text style={[styles.reviewTitle, { color: colors.text }]}>How was your cut?</Text>
 <Text style={[styles.reviewService, { color: colors.textSecondary }]}>{reviewAppt?.services?.name}</Text>
 <View style={styles.starsRow}>
 {[1, 2, 3, 4, 5].map(i => (
 <TouchableOpacity key={i} onPress={() => setRating(i)}>
 <Text style={[styles.star, { color: i <= rating ? '#FFD700' : colors.textSecondary }]}>★</Text>
 </TouchableOpacity>
 ))}
 </View>
 <TextInput
 style={[styles.reviewInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
 multiline
 value={reviewComment}
 onChangeText={setReviewComment}
 placeholder="Leave a comment..."
 placeholderTextColor={colors.textSecondary}
 />
 <TouchableOpacity style={[styles.submitReviewBtn, { backgroundColor: colors.accent }]} onPress={submitReview}>
 <Text style={[styles.submitReviewText, { color: '#FFFFFF' }]}>Submit Review</Text>
 </TouchableOpacity>
 <TouchableOpacity onPress={() => setReviewModal(false)}>
 <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip for now</Text>
 </TouchableOpacity>

 </View>
 </View>
 </Modal>
 </View>
 );
}

const styles = StyleSheet.create({
 container: { flex: 1, padding: 20, paddingTop: 60 },
 headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
 title: { fontSize: 28, fontWeight: 'bold' },
 logoutTop: { fontSize: 14, fontWeight: '600' },

 messagesBtn: {
 paddingHorizontal: 10,
 paddingVertical: 6,
 marginRight: 12,
 position: 'relative',
 },
 messagesBtnText: { fontSize: 22 },
 badgeDot: {
 position: 'absolute',
 top: 0,
 right: 0,
 backgroundColor: '#FF3B30',
 borderRadius: 10,
 minWidth: 20,
 height: 20,
 justifyContent: 'center',
 alignItems: 'center',
 paddingHorizontal: 4,
 },
 badgeDotText: {
 color: '#FFFFFF',
 fontSize: 11,
 fontWeight: 'bold',
 },

 loyaltyCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 14 },
 loyaltyTitle: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
 punchRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
 punchSlot: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
 punchCheck: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 18 },
 loyaltySub: { fontSize: 12, textAlign: 'center' },
 locationBtn: { padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 16, borderWidth: 1 },
 locationBtnText: { fontWeight: 'bold', fontSize: 15 },
 card: { padding: 16, borderRadius: 12, marginBottom: 14, borderWidth: 1 },
 cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
 cardTitle: { fontSize: 18, fontWeight: 'bold', flex: 1 },
 badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
 badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
 cardDate: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
 cardMeta: { fontSize: 13, marginBottom: 10 },
 serviceDesc: { fontSize: 13, lineHeight: 18, marginBottom: 10, fontStyle: 'italic' },
 noteBox: { padding: 10, borderRadius: 6, marginBottom: 10, borderWidth: 1 },
 noteLabel: { fontSize: 10, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
 noteText: { fontSize: 13, fontStyle: 'italic' },
 thumb: { width: '100%', height: 160, borderRadius: 8, marginBottom: 10 },
 cancelBtn: { marginTop: 4, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1 },
 cancelText: { fontSize: 12, fontWeight: '600' },
 rebookBtn: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, alignSelf: 'flex-start' },
 rebookText: { fontWeight: 'bold', fontSize: 13 },
 bookButton: { padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 },
 bookButtonText: { fontWeight: 'bold', fontSize: 16 },
 emptyBox: { alignItems: 'center', marginTop: 60 },
 emptyText: { fontSize: 16, fontWeight: '600' },
 emptySub: { fontSize: 13, marginTop: 6 },
 overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
 reviewSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1 },
 reviewTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
 reviewService: { fontSize: 14, marginBottom: 14 },
 starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 16 },
 star: { fontSize: 32 },
 reviewInput: { padding: 12, borderRadius: 8, borderWidth: 1, textAlignVertical: 'top', marginBottom: 16, minHeight: 80 },
 submitReviewBtn: { padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
 submitReviewText: { fontWeight: 'bold', fontSize: 16 },
 skipText: { textAlign: 'center', fontSize: 14, paddingVertical: 8 },
});