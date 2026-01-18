import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDeviceStore } from '../../src/stores/deviceStore';
import { api } from '../../src/lib/api';
import { formatHashrate, formatTemperature, formatPower } from '@axeos-vpn/shared-utils';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';

const logo = require('../../assets/logo.png');

export default function DashboardScreen() {
  const { devices, isLoading, setDevices, setLoading, setError } = useDeviceStore();

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const response = await api.getDevices();
      setDevices(response.devices);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch devices');
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const onlineDevices = devices.filter((d) => d.isOnline);
  const totalHashrate = devices.reduce(
    (sum, d) => sum + (d.latestMetrics?.hashrate.current ?? 0),
    0
  );
  const avgTemperature =
    onlineDevices.length > 0
      ? onlineDevices.reduce((sum, d) => sum + (d.latestMetrics?.temperature.average ?? 0), 0) /
        onlineDevices.length
      : 0;
  const totalPower = devices.reduce(
    (sum, d) => sum + (d.latestMetrics?.power.total ?? 0),
    0
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchDevices}
            tintColor={Colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Image source={logo} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.subtitle}>
            {onlineDevices.length} of {devices.length} devices online
          </Text>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Hashrate</Text>
            <Text style={[styles.summaryValue, { color: Colors.accent }]}>
              {formatHashrate(totalHashrate)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Avg Temp</Text>
            <Text
              style={[
                styles.summaryValue,
                {
                  color:
                    avgTemperature > 80
                      ? Colors.danger
                      : avgTemperature > 70
                      ? Colors.warning
                      : Colors.success,
                },
              ]}
            >
              {avgTemperature > 0 ? formatTemperature(avgTemperature) : '--'}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Power</Text>
            <Text style={styles.summaryValue}>{formatPower(totalPower)}</Text>
          </View>
        </View>

        {/* Device List */}
        {devices.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No devices yet</Text>
            <Text style={styles.emptySubtitle}>
              Add your first mining rig from the desktop app
            </Text>
          </View>
        ) : (
          <View style={styles.deviceList}>
            <Text style={styles.sectionTitle}>Devices</Text>
            {devices.map((device) => (
              <TouchableOpacity key={device.id} style={styles.deviceCard}>
                <View style={styles.deviceHeader}>
                  <View>
                    <Text style={styles.deviceName}>{device.name}</Text>
                    <Text style={styles.deviceStatus}>
                      {device.isOnline ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: device.isOnline ? Colors.success : Colors.textSecondary },
                    ]}
                  />
                </View>
                {device.isOnline && device.latestMetrics && (
                  <View style={styles.deviceMetrics}>
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>Hashrate</Text>
                      <Text style={[styles.metricValue, { color: Colors.accent }]}>
                        {formatHashrate(device.latestMetrics.hashrate.current)}
                      </Text>
                    </View>
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>Temp</Text>
                      <Text
                        style={[
                          styles.metricValue,
                          {
                            color:
                              device.latestMetrics.temperature.average > 80
                                ? Colors.danger
                                : device.latestMetrics.temperature.average > 70
                                ? Colors.warning
                                : Colors.success,
                          },
                        ]}
                      >
                        {formatTemperature(device.latestMetrics.temperature.average)}
                      </Text>
                    </View>
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>Power</Text>
                      <Text style={styles.metricValue}>
                        {formatPower(device.latestMetrics.power.total)}
                      </Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  logoImage: {
    width: 180,
    height: 60,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  summaryGrid: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  summaryValue: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  deviceList: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  deviceCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deviceName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  deviceStatus: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  deviceMetrics: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  metricValue: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
});
