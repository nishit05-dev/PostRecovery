import { useState, type ReactNode } from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { caregiverSnapshot, patientSnapshot } from './src/mock';

type Surface = 'patient' | 'caregiver';

export default function App() {
  const [surface, setSurface] = useState<Surface>('patient');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.badge}>Voice-first recovery copilot</Text>
          <Text style={styles.title}>Recovery Companion</Text>
          <Text style={styles.copy}>
            The mobile experience keeps a consented voice assistant available for patient questions,
            daily check-ins, and caregiver escalation when recovery signals drop.
          </Text>
        </View>

        <View style={styles.switcher}>
          <Pressable onPress={() => setSurface('patient')} style={[styles.tab, surface === 'patient' && styles.tabActive]}>
            <Text style={styles.tabText}>Patient</Text>
          </Pressable>
          <Pressable onPress={() => setSurface('caregiver')} style={[styles.tab, surface === 'caregiver' && styles.tabActive]}>
            <Text style={styles.tabText}>Caregiver</Text>
          </Pressable>
        </View>

        {surface === 'patient' ? <PatientSurface /> : <CaregiverSurface />}
      </ScrollView>
    </SafeAreaView>
  );
}

function PatientSurface() {
  return (
    <View style={styles.stack}>
      <Card title="Voice assistant">
        <Text style={styles.item}>Mode: continuous listening with consent</Text>
        <Text style={styles.item}>Languages: {patientSnapshot.language}</Text>
        <Text style={styles.item}>Prompt: "Can I eat papaya?"</Text>
        <Text style={styles.item}>Prompt: "I am feeling little pain in my body"</Text>
      </Card>

      <Card title="Approved recovery plan">
        <Text style={styles.item}>Patient: {patientSnapshot.patientName}</Text>
        <Text style={styles.item}>Diagnosis: {patientSnapshot.diagnosis}</Text>
        {patientSnapshot.meds.map((item) => (
          <Text key={item} style={styles.item}>
            {item}
          </Text>
        ))}
      </Card>

      <Card title="Daily recovery checklist">
        {patientSnapshot.checklist.map((item) => (
          <Text key={item} style={styles.item}>
            {item}
          </Text>
        ))}
      </Card>
    </View>
  );
}

function CaregiverSurface() {
  return (
    <View style={styles.stack}>
      <Card title="Live patient status">
        <Text style={styles.item}>Patient: {caregiverSnapshot.patientName}</Text>
        <Text style={styles.item}>Latest score: {caregiverSnapshot.latestScore}/100</Text>
        <Text style={styles.item}>{caregiverSnapshot.latestSymptoms}</Text>
      </Card>

      <Card title="Escalation flow">
        <Text style={styles.item}>{caregiverSnapshot.lastAlert}</Text>
        <Text style={styles.item}>If symptoms become red-flag, doctor is notified immediately.</Text>
      </Card>

      <Card title="Follow-up support">
        {patientSnapshot.followUps.map((item) => (
          <Text key={item} style={styles.item}>
            {item}
          </Text>
        ))}
        {patientSnapshot.alerts.map((item) => (
          <Text key={item} style={styles.item}>
            {item}
          </Text>
        ))}
      </Card>
    </View>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.stack}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7efe5',
  },
  content: {
    padding: 20,
    gap: 18,
  },
  hero: {
    padding: 24,
    borderRadius: 28,
    backgroundColor: '#fff9f2',
  },
  badge: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#b14b25',
    marginBottom: 10,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    color: '#16352d',
    marginBottom: 10,
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: '#496158',
  },
  switcher: {
    flexDirection: 'row',
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#efd8c9',
  },
  tabActive: {
    backgroundColor: '#eb6f3a',
  },
  tabText: {
    color: '#16352d',
    fontWeight: '600',
  },
  stack: {
    gap: 14,
  },
  card: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#fffaf5',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16352d',
    marginBottom: 10,
  },
  item: {
    color: '#496158',
    fontSize: 15,
    lineHeight: 22,
  },
});
