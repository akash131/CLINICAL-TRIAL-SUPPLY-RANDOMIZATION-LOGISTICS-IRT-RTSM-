import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Card, Title, Paragraph, Button, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';

export default function DashboardScreen() {
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = async () => {
    try {
      // In production, fetch real data
      setStats({
        todayEnrollments: 3,
        pendingRandomizations: 5,
        lowStockKits: 2,
        activePatients: 45,
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.content}>
        <Title style={styles.header}>Site Dashboard</Title>

        <View style={styles.statsGrid}>
          <Surface style={styles.statCard}>
            <MaterialCommunityIcons name="account-plus" size={40} color="#1976d2" />
            <Paragraph style={styles.statValue}>{stats?.todayEnrollments || 0}</Paragraph>
            <Paragraph style={styles.statLabel}>Today's Enrollments</Paragraph>
          </Surface>

          <Surface style={styles.statCard}>
            <MaterialCommunityIcons name="shuffle-variant" size={40} color="#2e7d32" />
            <Paragraph style={styles.statValue}>{stats?.pendingRandomizations || 0}</Paragraph>
            <Paragraph style={styles.statLabel}>Pending Randomizations</Paragraph>
          </Surface>

          <Surface style={styles.statCard}>
            <MaterialCommunityIcons name="alert" size={40} color="#ed6c02" />
            <Paragraph style={styles.statValue}>{stats?.lowStockKits || 0}</Paragraph>
            <Paragraph style={styles.statLabel}>Low Stock Alerts</Paragraph>
          </Surface>

          <Surface style={styles.statCard}>
            <MaterialCommunityIcons name="account-group" size={40} color="#9c27b0" />
            <Paragraph style={styles.statValue}>{stats?.activePatients || 0}</Paragraph>
            <Paragraph style={styles.statLabel}>Active Patients</Paragraph>
          </Surface>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Title>Quick Actions</Title>
            <Button
              mode="contained"
              icon="account-plus"
              style={styles.actionButton}
              onPress={() => {}}
            >
              Enroll New Patient
            </Button>
            <Button
              mode="contained"
              icon="barcode-scan"
              style={styles.actionButton}
              onPress={() => {}}
            >
              Scan Kit Barcode
            </Button>
            <Button
              mode="outlined"
              icon="package-variant"
              style={styles.actionButton}
              onPress={() => {}}
            >
              Check Inventory
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title>Recent Activity</Title>
            <Paragraph style={styles.placeholder}>
              Recent activities will appear here...
            </Paragraph>
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  header: {
    fontSize: 24,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  card: {
    marginBottom: 16,
    borderRadius: 8,
  },
  actionButton: {
    marginTop: 12,
  },
  placeholder: {
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
});
