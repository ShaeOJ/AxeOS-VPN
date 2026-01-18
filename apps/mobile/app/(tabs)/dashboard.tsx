import { useEffect, useCallback } from 'react';
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  SlideInLeft,
} from 'react-native-reanimated';
import { useDeviceStore } from '../../src/stores/deviceStore';
import { api } from '../../src/lib/api';
import { formatHashrate, formatTemperature, formatPower } from '@axeos-vpn/shared-utils';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

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

  // Glitch animation for pull-to-refresh
  const glitchOffset = useSharedValue(0);

  const triggerGlitch = useCallback(() => {
    glitchOffset.value = withSequence(
      withTiming(-3, { duration: 50, easing: Easing.linear }),
      withTiming(3, { duration: 50, easing: Easing.linear }),
      withTiming(-2, { duration: 40, easing: Easing.linear }),
      withTiming(2, { duration: 40, easing: Easing.linear }),
      withTiming(0, { duration: 30, easing: Easing.linear })
    );
  }, []);

  const headerGlitchStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glitchOffset.value }],
  }));

  const handleRefresh = async () => {
    triggerGlitch();
    await fetchDevices();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
          />
        }
      >
        <Animated.View
          style={[styles.header, headerGlitchStyle]}
          entering={FadeIn.duration(400).delay(100)}
        >
          <Image source={logo} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.subtitle}>
            {onlineDevices.length} of {devices.length} devices online
          </Text>
        </Animated.View>

        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <Animated.View
            style={styles.summaryCard}
            entering={SlideInLeft.duration(350).delay(150)}
          >
            <Text style={styles.summaryLabel}>Total Hashrate</Text>
            <Text style={[styles.summaryValue, { color: Colors.accent }]}>
              {formatHashrate(totalHashrate)}
            </Text>
          </Animated.View>
          <Animated.View
            style={styles.summaryCard}
            entering={SlideInLeft.duration(350).delay(200)}
          >
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
          </Animated.View>
          <Animated.View
            style={styles.summaryCard}
            entering={SlideInLeft.duration(350).delay(250)}
          >
            <Text style={styles.summaryLabel}>Total Power</Text>
            <Text style={styles.summaryValue}>{formatPower(totalPower)}</Text>
          </Animated.View>
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
            <Animated.Text
              style={styles.sectionTitle}
              entering={FadeIn.duration(300).delay(300)}
            >
              Devices
            </Animated.Text>
            {devices.map((device, index) => (
              <AnimatedTouchableOpacity
                key={device.id}
                style={styles.deviceCard}
                entering={SlideInLeft.duration(350).delay(350 + index * 80)}
              >
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
              </AnimatedTouchableOpacity>
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
