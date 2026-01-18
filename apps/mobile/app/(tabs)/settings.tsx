import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { api } from '../../src/lib/api';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import Constants from 'expo-constants';

export default function SettingsScreen() {
  const { user, refreshToken, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            if (refreshToken) {
              await api.logout(refreshToken);
            }
          } finally {
            await logout();
            router.replace('/(auth)/login');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.content}>
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Version</Text>
              <Text style={styles.value}>
                {Constants.expoConfig?.version || '0.1.0'}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.label}>Build</Text>
              <Text style={styles.value}>
                {Constants.expoConfig?.ios?.buildNumber ||
                  Constants.expoConfig?.android?.versionCode ||
                  '1'}
              </Text>
            </View>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    padding: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    paddingTop: 0,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  label: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  value: {
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.danger + '20',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  signOutText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.danger,
  },
});
