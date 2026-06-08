import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, Image,
  ScrollView, ActivityIndicator, Alert, FlatList
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';

export default function BookingScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { rebookServiceId, rebookNotes } = route.params || {};

  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(rebookServiceId || null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [datesWithSlots, setDatesWithSlots] = useState(new Set());
  const [notes, setNotes] = useState(rebookNotes || '');
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [loading, setLoading] = useState(false);

  const [giftCode, setGiftCode] = useState('');
  const [giftDiscount, setGiftDiscount] = useState(0);
  const [giftValidating, setGiftValidating] = useState(false);

  const [userProfile, setUserProfile] = useState(null);
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);

  useEffect(() => {
    fetchServices();
    generateDates();
    fetchUserProfile();
  }, []);

  useEffect(() => {
    if (selectedDate) fetchSlotsForDate(selectedDate);
  }, [selectedDate]);

  async function fetchUserProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setUserProfile(data);
    }
  }

  async function generateDates() {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      dates.push({
        dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        isToday: i === 0,
      });
    }
    setAvailableDates(dates);
    setSelectedDate(dates[0].dateStr);

    const dateStrs = dates.map(d => d.dateStr);
    const { data } = await supabase
      .from('time_slots')
      .select('date')
      .in('date', dateStrs)
      .eq('is_booked', false);
    setDatesWithSlots(new Set(data?.map(s => s.date) || []));
  }

  async function fetchServices() {
    const { data, error } = await supabase.from('services').select('*').eq('is_active', true);
    if (!error) setServices(data);
  }

  async function fetchSlotsForDate(dateStr) {
    setSelectedSlot(null);
    const { data, error } = await supabase
      .from('time_slots')
      .select('*')
      .eq('date', dateStr)
      .eq('is_booked', false)
      .order('time', { ascending: true });
    if (error) { console.error(error); setAvailableSlots([]); }
    else setAvailableSlots(data || []);
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.4, base64: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImage(result.assets[0].uri);
      setImageBase64(result.assets[0].base64);
    }
  }

  async function uploadImage(base64Data, userId) {
    if (!base64Data) return null;
    try {
      const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `${userId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('reference-images').upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data: publicUrlData } = supabase.storage.from('reference-images').getPublicUrl(fileName);
      return publicUrlData.publicUrl;
    } catch (error) {
      Alert.alert('Image Upload Failed', 'Your booking will proceed without the reference photo.');
      return null;
    }
  }

  async function applyGiftCard() {
  if (!giftCode.trim()) return;
  setGiftValidating(true);
  const { data, error } = await supabase
    .from('gift_cards')
    .select('*')
    .eq('code', giftCode.trim())
    .eq('is_active', true)
    .maybeSingle(); // <-- CHANGED from .single()

  setGiftValidating(false);
  if (error || !data || data.balance <= 0) {
    Alert.alert('Invalid Code', 'This gift card is not valid or has no balance.');
    setGiftDiscount(0);
    return;
  }
  const service = services.find(s => s.id === selectedService);
  const discount = service ? Math.min(data.balance, service.price) : 0;
  setGiftDiscount(discount);
  Alert.alert('Gift Card Applied', `$${discount.toFixed(2)} discount applied.`);
}

  async function notifyBarber(clientName, serviceName) {
    try {
      const { data: barber } = await supabase.from('profiles').select('expo_push_token').eq('is_admin', true).maybeSingle();
      if (!barber?.expo_push_token) return;
      await supabase.functions.invoke('push-notification', {
        body: { expoPushToken: barber.expo_push_token, title: 'New Booking!', body: `${clientName} booked a ${serviceName}` },
      });
    } catch (e) { console.log('Notify error:', e); }
  }

  async function handleBookAppointment() {
    if (!selectedService || !selectedSlot || !selectedDate) {
      Alert.alert('Selection Missing', 'Please select a service, date, and time slot.');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (redeemLoyalty) {
      const { data: redeemed } = await supabase.rpc('redeem_loyalty_punch', { client_uuid: user.id });
      if (!redeemed) {
        setLoading(false);
        Alert.alert('Redemption Failed', 'Not enough punches.');
        return;
      }
    }

    const { data: slotCheck, error: slotCheckError } = await supabase
      .from('time_slots').select('is_booked').eq('date', selectedDate).eq('time', selectedSlot).single();
    if (slotCheckError || !slotCheck || slotCheck.is_booked) {
      setLoading(false);
      Alert.alert('Slot Taken', 'Someone else just booked this slot. Please choose another time.');
      fetchSlotsForDate(selectedDate);
      return;
    }

    let uploadedImageUrl = null;
    if (imageBase64) uploadedImageUrl = await uploadImage(imageBase64, user.id);

    const [hours, minutes] = selectedSlot.split(':').map(Number);
    const [year, month, day] = selectedDate.split('-').map(Number);
    const appointmentTime = new Date(year, month - 1, day, hours, minutes, 0);

    const { error: apptError } = await supabase.from('appointments').insert([{
      client_id: user.id,
      service_id: selectedService,
      start_time: appointmentTime.toISOString(),
      client_notes: notes,
      reference_image_url: uploadedImageUrl,
      status: 'confirmed',
      gift_card_code: giftDiscount > 0 ? giftCode : null,
    }]);

    if (apptError) {
      setLoading(false);
      Alert.alert('Booking Failed', apptError.message);
      return;
    }

    await supabase.from('time_slots').update({ is_booked: true }).eq('date', selectedDate).eq('time', selectedSlot);

    const serviceName = services.find(s => s.id === selectedService)?.name || ' haircut';
    const clientName = user.user_metadata?.full_name || user.email || 'A client';
    await notifyBarber(clientName, serviceName);

    setImage(null); setImageBase64(null); setGiftCode(''); setGiftDiscount(0); setRedeemLoyalty(false);
    setLoading(false);
    Alert.alert('Booked!', 'Your haircut has been scheduled successfully.');
    navigation.navigate('ClientHome');
  }

  const renderDateChip = ({ item }) => {
    const hasSlots = datesWithSlots.has(item.dateStr);
    const isSelected = selectedDate === item.dateStr;
    return (
      <TouchableOpacity
        style={[styles.dateChip, {
          backgroundColor: isSelected ? colors.accent : colors.card,
          borderColor: isSelected ? colors.accent : colors.border,
          opacity: !hasSlots ? 0.6 : 1
        }]}
        onPress={() => hasSlots && setSelectedDate(item.dateStr)}
        activeOpacity={hasSlots ? 0.6 : 1}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.dateDay, { color: isSelected ? colors.card : colors.textSecondary }]}>{item.dayName}</Text>
          <Text style={[styles.dateNum, { color: isSelected ? colors.card : colors.text }]}>{item.dayNum}</Text>
          {item.isToday && <Text style={[styles.todayLabel, { color: isSelected ? colors.card : colors.accent }]}>TODAY</Text>}
        </View>
        {!hasSlots && <View style={styles.slashLine} />}
      </TouchableOpacity>
    );
  };

  const servicePrice = services.find(s => s.id === selectedService)?.price || 0;
  const finalPrice = Math.max(0, servicePrice - giftDiscount - (redeemLoyalty ? servicePrice : 0));

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Select Your Cut Style</Text>
      <View style={styles.grid}>
        {services.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, {
              backgroundColor: colors.card,
              borderColor: selectedService === item.id ? colors.accent : colors.border
            }]}
            onPress={() => setSelectedService(item.id)}
          >
            <Text style={[styles.cardText, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.cardSubtext, { color: colors.textSecondary }]}>${item.price} • {item.duration_minutes}m</Text>
            {selectedService === item.id && item.description ? (
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{item.description}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {/* AI Smart Suggest Button */}
      <TouchableOpacity
        style={[styles.aiSuggestBtn, { backgroundColor: colors.accent + '15', borderColor: colors.accent }]}
        onPress={() => navigation.navigate('AIChat', { prefillIntent: 'smart_booking' })}
      >
        <Text style={[styles.aiSuggestText, { color: colors.accent }]}>
          🤖 Ask AI when to book
        </Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Pick a Date</Text>
      <FlatList horizontal data={availableDates} keyExtractor={(item) => item.dateStr}
        showsHorizontalScrollIndicator={false} renderItem={renderDateChip} contentContainerStyle={{ paddingRight: 20 }} />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Choose an Available Slot</Text>
      {availableSlots.length === 0 ? (
        <Text style={[styles.emptySlots, { color: colors.textSecondary }]}>No open slots for this day. Try another date.</Text>
      ) : (
        <View style={styles.slotGrid}>
          {availableSlots.map((slot) => (
            <TouchableOpacity
              key={slot.id}
              style={[styles.slotButton, {
                backgroundColor: selectedSlot === slot.time ? colors.accent : colors.card,
                borderColor: selectedSlot === slot.time ? colors.accent : colors.border
              }]}
              onPress={() => setSelectedSlot(slot.time)}
            >
              <Text style={[styles.slotText, { color: selectedSlot === slot.time ? colors.card : colors.text }]}>{slot.time}</Text>
              <Text style={[styles.slotDuration, { color: selectedSlot === slot.time ? colors.card : colors.textSecondary }]}>{slot.duration_minutes || 30}m</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {(userProfile?.loyalty_punches >= 5) && (
        <TouchableOpacity
          style={[styles.loyaltyToggle, { backgroundColor: redeemLoyalty ? colors.accent : colors.card, borderColor: colors.border }]}
          onPress={() => setRedeemLoyalty(!redeemLoyalty)}>
          <Text style={[styles.loyaltyToggleText, { color: redeemLoyalty ? colors.card : colors.text }]}>
            {redeemLoyalty ? '✓ Free Cut Redeemed' : `Redeem Free Cut (${userProfile.loyalty_punches} punches)`}
          </Text>
        </TouchableOpacity>
      )}

      <View style={[styles.giftRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[styles.giftInput, { color: colors.text }]}
          placeholder="Gift Card Code"
          placeholderTextColor={colors.textSecondary}
          value={giftCode}
          onChangeText={setGiftCode}
          autoCapitalize="characters"
        />
        <TouchableOpacity style={[styles.giftBtn, { backgroundColor: colors.accent }]} onPress={applyGiftCard} disabled={giftValidating}>
          <Text style={[styles.giftBtnText, { color: colors.card }]}>{giftValidating ? '...' : 'Apply'}</Text>
        </TouchableOpacity>
      </View>
      {giftDiscount > 0 && <Text style={[styles.giftApplied, { color: colors.danger }]}>Discount: -${giftDiscount.toFixed(2)}</Text>}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Describe Your Desired Style</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
        placeholder="e.g., Keep it long on top, mid fade on the sides..."
        placeholderTextColor={colors.textSecondary}
        multiline numberOfLines={3} value={notes} onChangeText={setNotes}
      />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>5. Add Reference Picture</Text>
      <TouchableOpacity style={[styles.imagePickerButton, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={pickImage}>
        {image ? <Image source={{ uri: image }} style={styles.previewImage} /> : (
          <Text style={[styles.imagePickerText, { color: colors.textSecondary }]}>+ Upload Inspiration Photo</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.submitButton, { backgroundColor: colors.accent }]} onPress={handleBookAppointment} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.card} /> : (
          <Text style={[styles.submitButtonText, { color: colors.card }]}>
            {finalPrice <= 0 ? 'Confirm FREE Booking' : `Confirm Booking — $${finalPrice.toFixed(2)}`}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 24, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48%', padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1 },
  cardText: { fontWeight: 'bold', fontSize: 15 },
  cardSubtext: { fontSize: 12, marginTop: 4 },
  cardDescription: { fontSize: 13, marginTop: 8, lineHeight: 18, fontStyle: 'italic' },
  aiSuggestBtn: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  aiSuggestText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  dateChip: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginRight: 10, alignItems: 'center', borderWidth: 1, minWidth: 60, overflow: 'hidden' },
  dateDay: { fontSize: 11, fontWeight: '600' },
  dateNum: { fontSize: 18, fontWeight: 'bold', marginTop: 2 },
  todayLabel: { fontSize: 8, fontWeight: 'bold', marginTop: 4 },
  slashLine: { position: 'absolute', width: 2, height: '180%', backgroundColor: '#666666', opacity: 0.4, transform: [{ rotate: '45deg' }] },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slotButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  slotText: { fontWeight: '600' },
  slotDuration: { fontSize: 10, marginTop: 2 },
  emptySlots: { fontStyle: 'italic', marginBottom: 10 },
  loyaltyToggle: { padding: 14, borderRadius: 8, borderWidth: 1, alignItems: 'center', marginTop: 10, marginBottom: 6 },
  loyaltyToggleText: { fontWeight: 'bold', fontSize: 14 },
  giftRow: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, marginTop: 10, marginBottom: 4 },
  giftInput: { flex: 1, paddingVertical: 12, fontSize: 15 },
  giftBtn: { paddingHorizontal: 18, justifyContent: 'center', borderTopRightRadius: 7, borderBottomRightRadius: 7, marginRight: -12 },
  giftBtnText: { fontWeight: 'bold', fontSize: 14 },
  giftApplied: { fontWeight: 'bold', fontSize: 13, marginBottom: 10, marginLeft: 4 },
  input: { padding: 14, borderRadius: 8, textAlignVertical: 'top', borderWidth: 1, marginBottom: 10 },
  imagePickerButton: { height: 150, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, overflow: 'hidden' },
  imagePickerText: {},
  previewImage: { width: '100%', height: '100%' },
  submitButton: { padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 30 },
  submitButtonText: { fontWeight: 'bold', fontSize: 16 },
});