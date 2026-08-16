import { create } from 'zustand';
import type {
  DeviceInfo,
  AppInfo,
  ThresholdConfig,
  MonitorSwitches,
  MonitorDataPackage,
  CpuData,
  BatteryData,
  MemoryData,
  GpuData,
  ColdStartData,
  HotStartData,
  ThresholdAlert,
  TestRecord,
  DEFAULT_THRESHOLDS
} from '../../shared/types';
import { DEFAULT_THRESHOLDS as DT } from '../../shared/types';

type MonitorStatus = 'idle' | 'running' | 'paused' | 'completed';

interface AppState {
  // ===== 设备相关 =====
  devices: DeviceInfo[];
  selectedDeviceId: string | null;
  isScanningDevices: boolean;

  // ===== APP相关 =====
  installedApps: AppInfo[];
  selectedPackageName: string | null;
  isLoadingApps: boolean;
  uploadedApkPath: string | null;

  // ===== 监控状态 =====
  monitorStatus: MonitorStatus;
  monitorSwitches: MonitorSwitches;
  currentRecordId: string | null;

  // ===== 实时数据（缓存最近1000条） =====
  cpuHistory: CpuData[];
  batteryHistory: BatteryData[];
  memoryHistory: MemoryData[];
  gpuHistory: GpuData[];

  // ===== 阈值配置 =====
  thresholds: ThresholdConfig;

  // ===== 告警 =====
  alerts: ThresholdAlert[];

  // ===== 启动测试 =====
  coldStartResult: ColdStartData | null;
  hotStartResult: HotStartData | null;
  isRunningColdTest: boolean;
  isRunningHotTest: boolean;
  coldTrafficConfig: { networkThreshold: number; initialTraffic: number } | null;

  // ===== 历史记录 =====
  historyRecords: TestRecord[];
  isLoadingHistory: boolean;

  // ===== 页面状态 =====
  currentView: 'dashboard' | 'coldStart' | 'hotStart' | 'history' | 'thresholds' | 'alerts';
  fullscreenMetric: 'cpu' | 'battery' | 'memory' | 'gpu' | null;
  globalError: string | null;
}

interface AppActions {
  // 设备
  setDevices: (devices: DeviceInfo[]) => void;
  selectDevice: (id: string | null) => void;
  setScanning: (v: boolean) => void;

  // APP
  setInstalledApps: (apps: AppInfo[]) => void;
  selectApp: (pkg: string | null) => void;
  setLoadingApps: (v: boolean) => void;
  setUploadedApk: (path: string | null) => void;
  setColdTrafficConfig: (cfg: { networkThreshold: number; initialTraffic: number } | null) => void;

  // 监控控制
  toggleMetric: (metric: keyof MonitorSwitches) => void;
  setMonitorSwitches: (sw: MonitorSwitches) => void;
  setMonitorStatus: (s: MonitorStatus) => void;
  setCurrentRecordId: (id: string | null) => void;
  resetMonitorData: () => void;

  // 数据更新
  appendMonitorData: (data: MonitorDataPackage) => void;
  setThresholds: (t: ThresholdConfig) => void;
  addAlert: (a: ThresholdAlert) => void;
  clearAlerts: () => void;

  // 启动测试
  setColdStartResult: (r: ColdStartData | null) => void;
  setHotStartResult: (r: HotStartData | null) => void;
  setRunningColdTest: (v: boolean) => void;
  setRunningHotTest: (v: boolean) => void;

  // 历史记录
  setHistoryRecords: (r: TestRecord[]) => void;
  setLoadingHistory: (v: boolean) => void;

  // 视图
  setCurrentView: (v: AppState['currentView']) => void;
  setFullscreenMetric: (m: AppState['fullscreenMetric']) => void;
  setGlobalError: (msg: string | null) => void;
  clearAll: () => void;
}

const MAX_HISTORY = 1000;

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  // ===== 初始状态 =====
  devices: [],
  selectedDeviceId: null,
  isScanningDevices: false,

  installedApps: [],
  selectedPackageName: null,
  isLoadingApps: false,
  uploadedApkPath: null,

  monitorStatus: 'idle',
  monitorSwitches: { cpu: true, battery: true, memory: true, gpu: true },
  currentRecordId: null,

  cpuHistory: [],
  batteryHistory: [],
  memoryHistory: [],
  gpuHistory: [],

  thresholds: JSON.parse(JSON.stringify(DT)),

  alerts: [],

  coldStartResult: null,
  hotStartResult: null,
  isRunningColdTest: false,
  isRunningHotTest: false,
  coldTrafficConfig: null,

  historyRecords: [],
  isLoadingHistory: false,

  currentView: 'dashboard',
  fullscreenMetric: null,
  globalError: null,

  // ===== Actions =====
  setDevices: (devices) => set({ devices }),
  selectDevice: (id) => {
    set({
      selectedDeviceId: id,
      selectedPackageName: null,
      coldStartResult: null,
      hotStartResult: null
    });
    // 切换设备时清空数据
    get().resetMonitorData();
  },
  setScanning: (v) => set({ isScanningDevices: v }),

  setInstalledApps: (apps) => set({ installedApps: apps }),
  selectApp: (pkg) => set({ selectedPackageName: pkg }),
  setLoadingApps: (v) => set({ isLoadingApps: v }),
  setUploadedApk: (path) => set({ uploadedApkPath: path }),
  setColdTrafficConfig: (cfg) => set({ coldTrafficConfig: cfg }),

  toggleMetric: (metric) =>
    set((s) => ({
      monitorSwitches: { ...s.monitorSwitches, [metric]: !s.monitorSwitches[metric] }
    })),
  setMonitorSwitches: (sw) => set({ monitorSwitches: sw }),
  setMonitorStatus: (s) => set({ monitorStatus: s }),
  setCurrentRecordId: (id) => set({ currentRecordId: id }),
  resetMonitorData: () =>
    set({
      cpuHistory: [],
      batteryHistory: [],
      memoryHistory: [],
      gpuHistory: [],
      alerts: [],
      coldStartResult: null,
      hotStartResult: null
    }),

  appendMonitorData: (data) =>
    set((s) => ({
      cpuHistory: data.cpu
        ? [...s.cpuHistory, data.cpu].slice(-MAX_HISTORY)
        : s.cpuHistory,
      batteryHistory: data.battery
        ? [...s.batteryHistory, data.battery].slice(-MAX_HISTORY)
        : s.batteryHistory,
      memoryHistory: data.memory
        ? [...s.memoryHistory, data.memory].slice(-MAX_HISTORY)
        : s.memoryHistory,
      gpuHistory: data.gpu
        ? [...s.gpuHistory, data.gpu].slice(-MAX_HISTORY)
        : s.gpuHistory
    })),

  setThresholds: (t) => set({ thresholds: t }),
  addAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts].slice(0, 500) })),
  clearAlerts: () => set({ alerts: [] }),

  setColdStartResult: (r) => set({ coldStartResult: r }),
  setHotStartResult: (r) => set({ hotStartResult: r }),
  setRunningColdTest: (v) => set({ isRunningColdTest: v }),
  setRunningHotTest: (v) => set({ isRunningHotTest: v }),

  setHistoryRecords: (r) => set({ historyRecords: r }),
  setLoadingHistory: (v) => set({ isLoadingHistory: v }),

  setCurrentView: (v) => set({ currentView: v }),
  setFullscreenMetric: (m) => set({ fullscreenMetric: m }),
  setGlobalError: (msg) => set({ globalError: msg }),

  clearAll: () =>
    set({
      selectedDeviceId: null,
      selectedPackageName: null,
      monitorStatus: 'idle',
      cpuHistory: [],
      batteryHistory: [],
      memoryHistory: [],
      gpuHistory: [],
      alerts: [],
      coldStartResult: null,
      hotStartResult: null
    })
}));

// 辅助工具：判断某个值是否超过阈值并返回颜色
export function getStatusColor(
  value: number,
  threshold: number,
  higherIsBad = true
): 'normal' | 'warning' | 'critical' {
  if (higherIsBad) {
    if (value <= threshold) return 'normal';
    if (value <= threshold * 1.1) return 'warning';
    return 'critical';
  } else {
    if (value >= threshold) return 'normal';
    if (value >= threshold * 0.9) return 'warning';
    return 'critical';
  }
}

export const STATUS_COLORS = {
  normal: '#52c41a',
  warning: '#faad14',
  critical: '#ff4d4f'
};
