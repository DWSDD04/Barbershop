import React, { useState, useEffect, useCallback } from 'react';
import {
 StyleSheet, Text, View, ScrollView, TouchableOpacity,
 Alert, Modal, TextInput, RefreshControl, Image, Linking
} from 'react-native';
import { supabase } from '../../../lib/supabase';

const HOUR_HEIGHT = 100;
const MINUTE_HEIGHT = HOUR_HEIGHT / 60;

export default function DayScheduleScreen({ route, navigation }) {
 const { date } = route.params || {};

 if (!date) {
 return (
 <View style={styles.container}>
 <Text style={styles.title}>No date selected. Go back and tap a day on the calendar.</Text>
 <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20, alignSelf: 'center' }}>
 <Text style={styles.backText}>← Go Back</Text>
 </TouchableOpacity>
 </View>
 );
 }

 const [slots, setSlots] = useState([]);
 const [appointments, setAppointments] = useState([]);
 const [refreshing, setRefreshing] = useState(false);
 const [newTime, setNewTime] = useState('');
 const [newDuration, setNewDuration] = useState('30');
 const [selectedAppointment, setSelectedAppointment] = useState(null);
 const [detailModalVisible, setDetailModalVisible] = useState(false);

 const [genStart, setGenStart] = useState('09:00');
 const [genEnd, setGenEnd] = useState('19:00');
 const [genInterval, setGenInterval] = useState('30');

 const [cancelModalVisible, setCancelModalVisible] = useState(false);
 const [cancelMessage, setCancelMessage] = useState('');
 const [cancellingApptId, setCancellingApptId] = useState(null);

 const [dayOffModalVisible, setDayOffModalVisible] = useState(false);
 const [dayOffMessage, setDayOffMessage] = useState('');

 const fetchDay = useCallback(async () => {
 setRefreshing(true);
 const [{ data: slotsData }, { data: appsData }] = await Promise.all([
 supabase.from('time_slots').select('*').eq('date', date).order('time', { ascending: true }),
 supabase.from('appointments')
 .select(`id, start_time, status, client_notes, reference_image_url, gift_card_code, client_id, profiles (full_name, phone_number), services (name, price, duration_minutes, description)`)
 .gte('start_time', `${date}T00:00:00Z`)
 .lte('start_time', `${date}T23:59:59Z`)
 .order('start_time', { ascending: true })
 ]);
 setSlots(slotsData || []);
 setAppointments(appsData || []);
 setRefreshing(false);
 }, [date]);

 useEffect(() => {
 async function loadSettings() {
 const { data } = await supabase.from('barber_settings').select('*').single();
 if (data) {
 setGenStart(data.default_start_time?.slice(0, 5) || '09:00');
 setGenEnd(data.default_end_time?.slice(0, 5) || '19:00');
 setGenInterval(String(data.slot_interval_minutes || 30));
 }
 }
 loadSettings();
 }, []);

 useEffect(() => { fetchDay(); }, [fetchDay]);

 const getAppointmentForSlot = (slotTime) => {
 return appointments.find(app => {
 if (app.status === 'cancelled') return false;
 const d = new Date(app.start_time);
 const h = String(d.getHours()).padStart(2, '0');
 const m = String(d.getMinutes()).padStart(2, '0');
 return `${h}:${m}` === slotTime;
 });
 };

 const getTop = (timeStr) => {
 const [h, m] = timeStr.split(':').map(Number);
 return (h * 60 + m) * MINUTE_HEIGHT;
 };

 const getHeight = (duration) => (duration || 30) * MINUTE_HEIGHT;

 const getSlotTimeFromAppointment = (start_time) => {
 const d = new Date(start_time);
 const dateStr = start_time.split('T')[0];
 const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
 return { dateStr, timeStr };
 };

 async function freeUpSlot(dateStr, timeStr) {
 await supabase.from('time_slots').update({ is_booked: false }).eq('date', dateStr).eq('time', timeStr);
 }

 async function bookSlot(dateStr, timeStr) {
 await supabase.from('time_slots').update({ is_booked: true }).eq('date', dateStr).eq('time', timeStr);
 }

 async function addSlot() {
 if (!newTime.match(/^\d{2}:\d{2}$/)) {
 Alert.alert('Invalid Time', 'Use 24-hour format: HH:MM (e.g. 14:30)');
 return;
 }
 const duration = parseInt(newDuration);
 if (isNaN(duration) || duration < 5) {
 Alert.alert('Invalid Duration', 'Minimum 5 minutes');
 return;
 }
 const { error } = await supabase.from('time_slots').insert([{
 date,
 time: newTime,
 duration_minutes: duration
 }]);
 if (error) Alert.alert('Error', error.message);
 else { setNewTime(''); setNewDuration('30'); fetchDay(); }
 }

 async function generateSlots() {
 if (!genStart.match(/^\d{2}:\d{2}$/) || !genEnd.match(/^\d{2}:\d{2}$/)) {
 Alert.alert('Invalid Time', 'Start and End must be HH:MM');
 return;
 }
 const interval = parseInt(genInterval);
 if (isNaN(interval) || interval < 5) {
 Alert.alert('Invalid Interval', 'Minimum 5 minutes');
 return;
 }

 const [sh, sm] = genStart.split(':').map(Number);
 const [eh, em] = genEnd.split(':').map(Number);
 let current = sh * 60 + sm;
 const end = eh * 60 + em;

 if (end <= current) {
 Alert.alert('Invalid Range', 'End time must be after start time');
 return;
 }

 const newSlots = [];
 while (current < end) {
 const h = String(Math.floor(current / 60)).padStart(2, '0');
 const m = String(current % 60).padStart(2, '0');
 const timeStr = `${h}:${m}`;
 if (!slots.find(s => s.time === timeStr)) {
 newSlots.push({ date, time: timeStr, duration_minutes: interval });
 }
 current += interval;
 }

 if (newSlots.length === 0) {
 Alert.alert('No new slots', 'All slots already exist for this range.');
 return;
 }

 const { error } = await supabase.from('time_slots').insert(newSlots);
 if (error) Alert.alert('Error', error.message);
 else fetchDay();
 }

 function confirmDeleteSlot(id) {
 Alert.alert('Remove Slot', 'Free up this time slot?', [
 { text: 'Cancel', style: 'cancel' },
 { text: 'Remove', style: 'destructive', onPress: async () => {
 const { error } = await supabase.from('time_slots').delete().eq('id', id);
 if (error) Alert.alert('Error', error.message);
 else fetchDay();
 }}
 ]);
 }

 async function updateStatus(id, newStatus) {
 const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);
 if (error) { Alert.alert('Error', error.message); return; }

 const { data: appt } = await supabase.from('appointments').select('start_time, client_id').eq('id', id).single();
 if (appt) {
 const { dateStr, timeStr } = getSlotTimeFromAppointment(appt.start_time);
 if (newStatus === 'cancelled') await freeUpSlot(dateStr, timeStr);
 else if (newStatus === 'confirmed') await bookSlot(dateStr, timeStr);
 else if (newStatus === 'completed') {
 await supabase.rpc('increment_loyalty_punch', { client_uuid: appt.client_id });
 }
 }
 fetchDay();
 setDetailModalVisible(false);
 }

 async function deleteAppointment(id) {
 Alert.alert('Delete Booking', 'Permanently remove this appointment and free the slot?', [
 { text: 'Keep', style: 'cancel' },
 { text: 'Delete', style: 'destructive', onPress: async () => {
 const { data: appt } = await supabase.from('appointments').select('start_time').eq('id', id).single();
 if (appt) {
 const { dateStr, timeStr } = getSlotTimeFromAppointment(appt.start_time);
 await supabase.from('appointments').delete().eq('id', id);
 await freeUpSlot(dateStr, timeStr);
 }
 fetchDay();
 setDetailModalVisible(false);
 }}
 ]);
 }

 function promptCancelWithMessage(appt) {
 setSelectedAppointment(appt);
 setCancellingApptId(appt.id);
 setCancelMessage(`Sorry, I have to cancel your ${appt.services?.name || 'appointment'} on ${date}.`);
 setCancelModalVisible(true);
 setDetailModalVisible(false);
 }

 async function confirmCancelWithMessage() {
 if (!cancellingApptId || !cancelMessage.trim()) {
 Alert.alert('Error', 'Please enter a message.');
 return;
 }

 const { data: { user } } = await supabase.auth.getUser();
 if (!user) { Alert.alert('Error', 'Not authenticated'); return; }

 const appt = appointments.find(a => a.id === cancellingApptId);
 if (!appt) return;

 const { dateStr, timeStr } = getSlotTimeFromAppointment(appt.start_time);

 const { error: updErr } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', cancellingApptId);
 if (updErr) { Alert.alert('Error', updErr.message); return; }

 await freeUpSlot(dateStr, timeStr);

 const { error: msgErr } = await supabase.from('messages').insert({
 sender_id: user.id,
 recipient_id: appt.client_id,
 appointment_id: appt.id,
 title: 'Appointment Cancelled',
 body: cancelMessage.trim(),
 type: 'cancellation',
 });

 if (msgErr) { Alert.alert('Message Error', msgErr.message); }
 else { Alert.alert('Sent', 'Cancellation message sent to client.'); }

 setCancelModalVisible(false);
 setCancellingApptId(null);
 setCancelMessage('');
 fetchDay();
 }

 function promptDayOff() {
 const hasBookings = appointments.some(a => a.status === 'confirmed' || a.status === 'pending');
 const defaultMsg = hasBookings
 ? `I'm taking the day off on ${date}. All appointments are cancelled. Sorry for the inconvenience!`
 : `I'm taking the day off on ${date}. The shop will be closed.`;
 setDayOffMessage(defaultMsg);
 setDayOffModalVisible(true);
 }

 async function doDayOff() {
 if (!dayOffMessage.trim()) {
 Alert.alert('Error', 'Please enter a message.');
 return;
 }

 const { data: { user } } = await supabase.auth.getUser();
 if (!user) { Alert.alert('Error', 'Not authenticated'); return; }

 setDayOffModalVisible(false);

 setTimeout(() => {
 Alert.alert(
 'Confirm Day Off',
 `This will cancel ALL appointments on ${date} and notify every client. Are you sure?`,
 [
 { text: 'Nevermind', style: 'cancel' },
 {
 text: 'Confirm Day Off',
 style: 'destructive',
 onPress: async () => {
 try {
 const { error } = await supabase.rpc('cancel_day_appointments', {
 p_date: date,
 p_message_title: 'Day Off Notice',
 p_message_body: dayOffMessage.trim(),
 p_sender_id: user.id,
 });

 if (error) {
 console.log('RPC failed, doing manual cancel:', error.message);
 const { data: dayApps } = await supabase.from('appointments')
 .select('id, client_id, start_time')
 .gte('start_time', `${date}T00:00:00Z`)
 .lte('start_time', `${date}T23:59:59Z`)
 .in('status', ['confirmed', 'pending']);

 for (const appt of (dayApps || [])) {
 const { dateStr, timeStr } = getSlotTimeFromAppointment(appt.start_time);
 await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
 await freeUpSlot(dateStr, timeStr);
 await supabase.from('messages').insert({
 sender_id: user.id,
 recipient_id: appt.client_id,
 appointment_id: appt.id,
 title: 'Appointment Cancelled – Day Off',
 body: dayOffMessage.trim(),
 type: 'day_off',
 target_date: date,
 });
 }

 await supabase.from('messages').insert({
 sender_id: user.id,
 recipient_id: null,
 title: 'Day Off Notice',
 body: dayOffMessage.trim(),
 type: 'day_off',
 target_date: date,
 });
 }

 setTimeout(() => {
 Alert.alert('Done', 'All clients have been notified.');
 }, 300);
 setDayOffMessage('');
 fetchDay();
 } catch (err) {
 console.error('Day off error:', err);
 Alert.alert('Error', err.message || 'Something went wrong.');
 }
 }
 }
 ]
 );
 }, 300);
 }

 return (
 <View style={styles.container}>
 <View style={styles.header}>
 <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
 <Text style={styles.backText}>← Back</Text>
 </TouchableOpacity>
 <Text style={styles.title}>{date}</Text>
 </View>
 <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchDay} tintColor="#000" />} showsVerticalScrollIndicator={false}>
 <TouchableOpacity style={styles.dayOffBtn} onPress={promptDayOff}>
 <Text style={styles.dayOffBtnText}>🌴 Send Day Off Notice</Text>
 </TouchableOpacity>
 <View style={styles.addForm}>
 <Text style={styles.formLabel}>Add Single Slot</Text>
 <View style={styles.row}>
 <TextInput style={[styles.input, { flex: 1 }]} placeholder="HH:MM" placeholderTextColor="#999" value={newTime} onChangeText={setNewTime} />
 <TextInput style={[styles.input, { flex: 1 }]} placeholder="Duration (min)" placeholderTextColor="#999" value={newDuration} onChangeText={setNewDuration} keyboardType="number-pad" />
 <TouchableOpacity style={styles.addBtn} onPress={addSlot}>
 <Text style={styles.addBtnText}>Add</Text>
 </TouchableOpacity>
 </View>
 </View>
 <TouchableOpacity style={styles.genBtn} onPress={generateSlots}>
 <Text style={styles.genBtnText}>Auto-Generate Day Slots</Text>
 </TouchableOpacity>
 <View style={styles.timelineContainer}>
 {Array.from({ length: 25 }).map((_, i) => (
 <View key={i} style={[styles.hourLine, { top: i * HOUR_HEIGHT }]}>
 <Text style={styles.hourLabel}>{String(i).padStart(2, '0')}:00</Text>
 <View style={styles.hourDivider} />
 </View>
 ))}
 {slots.map(slot => {
 const app = getAppointmentForSlot(slot.time);
 const occupied = !!app;
 const top = getTop(slot.time);
 const height = getHeight(slot.duration_minutes);
 return (
 <TouchableOpacity
 key={slot.id}
 style={[styles.slotBlock, { top, height, backgroundColor: occupied ? '#1A1A1A' : '#FFFFFF', borderColor: occupied ? '#1A1A1A' : '#E5E5E5' }]}
 onPress={() => { if (occupied) { setSelectedAppointment(app); setDetailModalVisible(true); } else { confirmDeleteSlot(slot.id); } }}
 activeOpacity={0.8}
 >
 <Text style={[styles.blockTime, { color: occupied ? '#FFFFFF' : '#1A1A1A' }]}>{slot.time}</Text>
 <Text style={[styles.blockDuration, { color: occupied ? '#AAAAAA' : '#666666' }]}>{slot.duration_minutes || 30}m</Text>
 {occupied && (
 <>
 <Text style={[styles.blockClient, { color: '#FFFFFF' }]}>{app.profiles?.full_name || 'Guest'}</Text>
 <Text style={[styles.blockService, { color: '#AAAAAA' }]}>{app.services?.name}</Text>
 </>
 )}
 </TouchableOpacity>
 );
 })}
 </View>
 </ScrollView>

 <Modal visible={detailModalVisible} animationType="slide" transparent onRequestClose={() => setDetailModalVisible(false)}>
 <View style={styles.overlay}>
 <View style={styles.sheet}>
 <View style={styles.sheetHeader}>
 <Text style={styles.sheetTitle}>Booking Details</Text>
 <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
 <Text style={styles.close}>✕</Text>
 </TouchableOpacity>
 </View>
 {selectedAppointment && (
 <ScrollView showsVerticalScrollIndicator={false}>
 <View style={styles.detailHeader}>
 <Text style={styles.detailTime}>{new Date(selectedAppointment.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
 <View style={[styles.badge, { backgroundColor: selectedAppointment.status === 'cancelled' ? '#C62828' : '#000000' }]}>
 <Text style={styles.badgeText}>{selectedAppointment.status.toUpperCase()}</Text>
 </View>
 </View>
 <Text style={styles.clientName}>{selectedAppointment.profiles?.full_name || 'Guest'}</Text>
 <Text style={styles.serviceLine}>{selectedAppointment.services?.name} — ${selectedAppointment.services?.price}</Text>
 {selectedAppointment.services?.description ? (
 <View style={styles.noteBox}>
 <Text style={styles.noteLabel}>Service Description</Text>
 <Text style={styles.noteBody}>{selectedAppointment.services.description}</Text>
 </View>
 ) : null}
 {selectedAppointment.gift_card_code && (
 <View style={styles.noteBox}>
 <Text style={styles.noteLabel}>Gift Card Used</Text>
 <Text style={styles.noteBody}>Code: {selectedAppointment.gift_card_code}</Text>
 </View>
 )}
 {selectedAppointment.client_notes && (
 <View style={styles.noteBox}>
 <Text style={styles.noteLabel}>Client Notes</Text>
 <Text style={styles.noteBody}>{selectedAppointment.client_notes}</Text>
 </View>
 )}
 {selectedAppointment.reference_image_url && (
 <>
 <Text style={styles.noteLabel}>Reference Photo</Text>
 <Image source={{ uri: selectedAppointment.reference_image_url }} style={styles.refImage} resizeMode="cover" />
 </>
 )}
 <View style={styles.actionRow}>
 <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${selectedAppointment.profiles?.phone_number}`)}>
 <Text style={styles.callText}>Call Client</Text>
 </TouchableOpacity>
 {selectedAppointment.status !== 'completed' ? (
 <TouchableOpacity style={styles.doneBtn} onPress={() => updateStatus(selectedAppointment.id, 'completed')}>
 <Text style={styles.doneText}>Mark Done</Text>
 </TouchableOpacity>
 ) : (
 <TouchableOpacity style={[styles.doneBtn, { backgroundColor: '#666666' }]} onPress={() => updateStatus(selectedAppointment.id, 'confirmed')}>
 <Text style={styles.doneText}>Reopen</Text>
 </TouchableOpacity>
 )}
 </View>
 {selectedAppointment.status !== 'cancelled' && selectedAppointment.status !== 'completed' && (
 <TouchableOpacity style={[styles.doneBtn, { backgroundColor: '#C62828', marginBottom: 10 }]} onPress={() => promptCancelWithMessage(selectedAppointment)}>
 <Text style={styles.doneText}>Cancel & Notify Client</Text>
 </TouchableOpacity>
 )}
 <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteAppointment(selectedAppointment.id)}>
 <Text style={styles.deleteText}>Delete Booking & Free Slot</Text>
 </TouchableOpacity>
 </ScrollView>
 )}
 </View>
 </View>
 </Modal>

 <Modal visible={cancelModalVisible} animationType="slide" transparent onRequestClose={() => setCancelModalVisible(false)}>
 <View style={styles.overlay}>
 <View style={styles.sheet}>
 <View style={styles.sheetHeader}>
 <Text style={styles.sheetTitle}>Cancel & Notify</Text>
 <TouchableOpacity onPress={() => setCancelModalVisible(false)}>
 <Text style={styles.close}>✕</Text>
 </TouchableOpacity>
 </View>
 <Text style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>The client will receive this message about their cancelled appointment.</Text>
 <TextInput style={[styles.input, { minHeight: 100, textAlignVertical: 'top', marginBottom: 16 }]} multiline value={cancelMessage} onChangeText={setCancelMessage} placeholder="Enter your cancellation message..." placeholderTextColor="#999" />
 <TouchableOpacity style={[styles.doneBtn, { backgroundColor: '#C62828' }]} onPress={confirmCancelWithMessage}>
 <Text style={styles.doneText}>Send Cancellation</Text>
 </TouchableOpacity>
 </View>
 </View>
 </Modal>

 <Modal visible={dayOffModalVisible} animationType="slide" transparent onRequestClose={() => setDayOffModalVisible(false)}>
 <View style={styles.overlay}>
 <View style={styles.sheet}>
 <View style={styles.sheetHeader}>
 <Text style={styles.sheetTitle}>Day Off Notice</Text>
 <TouchableOpacity onPress={() => setDayOffModalVisible(false)}>
 <Text style={styles.close}>✕</Text>
 </TouchableOpacity>
 </View>
 <Text style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>This will cancel every appointment on {date} and send the message to ALL clients.</Text>
 <TextInput style={[styles.input, { minHeight: 100, textAlignVertical: 'top', marginBottom: 16 }]} multiline value={dayOffMessage} onChangeText={setDayOffMessage} placeholder="Enter your day-off message..." placeholderTextColor="#999" />
 <TouchableOpacity style={[styles.doneBtn, { backgroundColor: '#D4A017' }]} onPress={doDayOff}>
 <Text style={styles.doneText}>Send to All Clients</Text>
 </TouchableOpacity>
 </View>
 </View>
 </Modal>
 </View>
 );
}

const styles = StyleSheet.create({
 container: { flex: 1, backgroundColor: '#F2F2F2', paddingHorizontal: 16, paddingTop: 60 },
 header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
 backBtn: { paddingVertical: 4, minWidth: 60 },
 backText: { color: '#000000', fontSize: 16, fontWeight: '600' },
 title: { fontSize: 22, fontWeight: 'bold', color: '#000000' },
 dayOffBtn: { backgroundColor: '#D4A017', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
 dayOffBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
 addForm: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E5E5', shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
 formLabel: { color: '#666666', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
 row: { flexDirection: 'row', gap: 10 },
 input: { backgroundColor: '#FFFFFF', color: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E5E5', fontSize: 15 },
 addBtn: { backgroundColor: '#000000', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, justifyContent: 'center' },
 addBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
 genBtn: { backgroundColor: '#000000', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 6 },
 genBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
 timelineContainer: { height: 24 * HOUR_HEIGHT, position: 'relative', marginLeft: 50, marginRight: 10, marginBottom: 20 },
 hourLine: { position: 'absolute', left: -50, right: 0, flexDirection: 'row', alignItems: 'center' },
 hourLabel: { color: '#999999', fontSize: 11, width: 45, textAlign: 'right', marginRight: 8 },
 hourDivider: { flex: 1, height: 1, backgroundColor: '#E5E5E5' },
 slotBlock: { position: 'absolute', left: 0, right: 0, borderRadius: 6, borderWidth: 1, padding: 6, overflow: 'hidden' },
 blockTime: { fontSize: 12, fontWeight: 'bold' },
 blockDuration: { fontSize: 10, marginTop: 1 },
 blockClient: { fontSize: 12, fontWeight: '600', marginTop: 2 },
 blockService: { fontSize: 10, marginTop: 1 },
 overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
 sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%', borderWidth: 1, borderColor: '#E5E5E5' },
 sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
 sheetTitle: { color: '#000000', fontSize: 20, fontWeight: 'bold' },
 close: { color: '#666666', fontSize: 20, padding: 4 },
 detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
 detailTime: { color: '#000000', fontWeight: 'bold', fontSize: 18 },
 badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
 badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
 clientName: { color: '#1A1A1A', fontSize: 22, fontWeight: '600', marginBottom: 4 },
 serviceLine: { color: '#666666', fontSize: 14, marginBottom: 16 },
 noteBox: { backgroundColor: '#F7F7F7', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#E5E5E5' },
 noteLabel: { color: '#666666', fontSize: 11, fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
 noteBody: { color: '#444444', fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
 refImage: { width: '100%', height: 220, borderRadius: 10, marginBottom: 20, backgroundColor: '#F2F2F2' },
 actionRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 14 },
 callBtn: { flex: 1, backgroundColor: '#F2F2F2', padding: 14, borderRadius: 8, alignItems: 'center' },
 callText: { color: '#1A1A1A', fontWeight: 'bold', fontSize: 14 },
 doneBtn: { flex: 1, backgroundColor: '#000000', padding: 14, borderRadius: 8, alignItems: 'center' },
 doneText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
 deleteBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 20 },
 deleteText: { color: '#C62828', fontSize: 14, fontWeight: '600' },
});