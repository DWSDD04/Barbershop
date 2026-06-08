import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, ScrollView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';

// ─── GROQ CONFIG ───
// Get your FREE key at: https://console.groq.com/keys
// Replace the line below with your actual key
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SUGGESTIONS = [
  "What cuts do you offer?",
  "When's my next appointment?",
  "How does loyalty work?",
  "I want a fade — what should I book?",
  "When should I book next?",
];

export default function AIChatScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { prefillIntent } = route.params || {};

  const [messages, setMessages] = useState([
    { id: 'welcome', role: 'assistant', content: "Hey! I'm your barbershop assistant. Ask me about services, booking, style advice, or upload a photo for recommendations!" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const flatListRef = useRef(null);

  // Load all data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    setUser(currentUser);

    const [profileRes, servicesRes, apptsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', currentUser.id).single(),
      supabase.from('services').select('*').eq('is_active', true),
      supabase.from('appointments')
        .select('*, services(name, price, duration_minutes)')
        .eq('client_id', currentUser.id)
        .order('start_time', { ascending: false })
        .limit(5),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    if (servicesRes.data) setServices(servicesRes.data);
    if (apptsRes.data) setAppointments(apptsRes.data);

    // Load chat history
    const { data: history } = await supabase
      .from('chat_logs')
      .select('*')
      .eq('client_id', currentUser.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (history?.length) {
      setMessages(prev => [
        prev[0],
        ...history.map(d => ({ id: d.id, role: d.role, content: d.content }))
      ]);
    }

    // Handle prefill from booking screen
    if (prefillIntent === 'smart_booking') {
      // Fetch available slots for smart booking
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 86400000);
      const { data: slotData } = await supabase
        .from('time_slots')
        .select('*')
        .eq('is_booked', false)
        .gte('date', now.toISOString().split('T')[0])
        .lte('date', weekLater.toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(40);
      setSlots(slotData || []);

      setTimeout(() => handleSmartBooking(currentUser.id, profileRes.data, servicesRes.data, apptsRes.data, slotData || []), 300);
    }
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.3,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      setSelectedImage(result.assets[0].uri);
      setImageBase64(result.assets[0].base64);
    }
  }

  // ─── BUILD SYSTEM PROMPT WITH LIVE CONTEXT ───
  function buildSystemPrompt() {
    const servicesList = services.map(s => 
      `- ${s.name}: $${s.price}, ${s.duration_minutes}min${s.description ? ` — ${s.description}` : ''}`
    ).join('\n');

    const apptsList = appointments.map(a => 
      `${a.services?.name} on ${new Date(a.start_time).toLocaleDateString()} (${a.status})`
    ).join(', ') || 'None';

    const punches = profile?.loyalty_punches || 0;
    const punchesNeeded = 5 - (punches % 5);

    return `You are the AI assistant for a barbershop app. You help clients with booking, style advice, and account questions.

SHOP SERVICES:
${servicesList}

CLIENT CONTEXT:
- Name: ${profile?.full_name || 'Guest'}
- Loyalty punches: ${punches} (${punchesNeeded} until free cut)
- Recent appointments: ${apptsList}

RULES:
- Be friendly, professional, and concise (max 3 sentences)
- If they want to book, suggest services and ask what date/time
- If asking about a specific style, ask if they want to upload a reference photo
- Never make up prices or services — only use the data above
- Always encourage them to book if they haven't been in a while`;
  }

  async function callGroq(systemPrompt, userMessage, model = 'llama-3.1-8b-instant', maxTokens = 500) {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Sorry, I didn't get a response.";
  }

  async function logChat(userId, userContent, aiReply, intent) {
    try {
      await supabase.from('chat_logs').insert([
        { client_id: userId, role: 'user', content: userContent, intent },
        { client_id: userId, role: 'assistant', content: aiReply, intent: `${intent}_response` },
      ]);
    } catch (e) { console.log('Chat log error:', e); }
  }

  async function handleSmartBooking(userId, currentProfile, currentServices, currentAppointments, currentSlots) {
    setLoading(true);
    const userMsg = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: 'When should I book my next appointment?' 
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const slotsList = (currentSlots || slots).map(s => 
        `- ${s.date} at ${s.time} (${s.duration_minutes || 30}min slot)`
      ).join('\n') || 'No slots available';

      const appts = currentAppointments || appointments;
      const historyList = appts.map(a => {
        const d = new Date(a.start_time);
        return `- ${a.services?.name} on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      }).join('\n') || 'No previous visits';

      const prof = currentProfile || profile;
      const punches = prof?.loyalty_punches || 0;

      const systemPrompt = `You are a barbershop booking assistant. Based on the client's history and current availability, suggest the best 2-3 time slots to book.

CLIENT HISTORY:
${historyList}

AVAILABLE SLOTS (next 7 days):
${slotsList}

RULES:
- Consider their preferred days/times from history
- Prioritize slots that match their past booking patterns
- Mention the service name if they usually book the same thing
- Keep it to 2-3 specific suggestions with exact dates and times
- ${punches >= 5 ? 'They have enough loyalty punches for a FREE cut! Mention this.' : `They need ${5 - (punches % 5)} more punches for a free cut.`}
- If no slots are available, say so politely`;

      const reply = await callGroq(systemPrompt, 'When should I book my next appointment?', 'llama-3.1-8b-instant', 600);

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply
      }]);

      logChat(userId, 'When should I book my next appointment?', reply, 'smart_booking');
    } catch (err) {
      console.log('Smart booking error:', err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I couldn't fetch smart suggestions right now."
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(text, intent = 'chat') {
    if (!text.trim() && intent !== 'analyze_image') return;
    if (loading || !user) return;

    const userContent = intent === 'analyze_image' 
      ? '[Uploaded reference photo]' 
      : text.trim();

    const userMsg = { id: Date.now().toString(), role: 'user', content: userContent };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      let reply = '';

      if (intent === 'analyze_image' && imageBase64) {
        const servicesList = services.map(s => 
          `- ${s.name} ($${s.price}, ${s.duration_minutes}min): ${s.description || 'Standard service'}`
        ).join('\n');

        const systemPrompt = `You are a barbershop style advisor. Analyze the reference photo and suggest which service from the menu would achieve this look.

AVAILABLE SERVICES:
${servicesList}

Respond in 2-3 sentences. Suggest the best service match and explain why.`;

        const response = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.2-11b-vision-preview',
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: text || 'What haircut/style is this? Which service should I book?' },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                ],
              },
            ],
            temperature: 0.7,
            max_tokens: 800,
          }),
        });

        if (!response.ok) throw new Error(`Vision API ${response.status}`);
        const data = await response.json();
        reply = data.choices?.[0]?.message?.content || "I couldn't analyze that image.";
      } else {
        const systemPrompt = buildSystemPrompt();
        reply = await callGroq(systemPrompt, text.trim());
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply
      }]);

      logChat(user.id, userContent, reply, intent);
    } catch (err) {
      console.log('AI error:', err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Error: " + (err.message || 'Check your Groq API key. Get one free at console.groq.com/keys')
      }]);
    } finally {
      setLoading(false);
      setSelectedImage(null);
      setImageBase64(null);
    }
  }

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[
        styles.messageBubble,
        isUser 
          ? [styles.userBubble, { backgroundColor: colors.accent }] 
          : [styles.aiBubble, { backgroundColor: isDark ? '#2A2A2A' : '#F0F0F0' }]
      ]}>
        <Text style={[
          styles.messageText,
          isUser ? { color: '#FFFFFF' } : { color: isDark ? '#FFFFFF' : '#1A1A1A' }
        ]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: colors.text }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Barber AI</Text>
          <View style={styles.onlineDot} />
        </View>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {selectedImage && (
        <View style={styles.imagePreviewRow}>
          <Image source={{ uri: selectedImage }} style={styles.previewThumb} />
          <TouchableOpacity onPress={() => { setSelectedImage(null); setImageBase64(null); }}>
            <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {messages.length <= 2 && !selectedImage && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsRow}
        >
          {SUGGESTIONS.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.chip, { borderColor: colors.border }]}
              onPress={() => {
                if (s === 'When should I book next?') handleSmartBooking(user?.id);
                else sendMessage(s);
              }}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
        <TouchableOpacity onPress={pickImage} style={styles.imageBtn}>
          <Text style={{ fontSize: 22 }}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={[styles.input, { 
            backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5',
            color: colors.text 
          }]}
          placeholder="Ask about cuts, booking, styles..."
          placeholderTextColor={isDark ? '#888' : '#999'}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
          multiline
        />

        <TouchableOpacity 
          style={[styles.sendBtn, { backgroundColor: colors.accent }]}
          onPress={() => {
            if (selectedImage && imageBase64) {
              sendMessage(input || 'What style is this?', 'analyze_image');
            } else {
              sendMessage(input);
            }
          }}
          disabled={loading || (!input.trim() && !selectedImage)}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.sendText}>→</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
  },
  backText: { fontSize: 16, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' },
  messagesList: { padding: 16, paddingBottom: 20 },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  suggestionsRow: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  previewThumb: { width: 60, height: 60, borderRadius: 8 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  imageBtn: { padding: 4 },
  input: {
    flex: 1,
    padding: 12,
    borderRadius: 20,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendText: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' },
});