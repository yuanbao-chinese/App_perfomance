// 设备信息类型
export interface DeviceInfo {
  id: string;              // 设备唯一ID
  model: string;           // 设备型号
  systemVersion: string;   // 系统版本
  status: 'connected' | 'disconnected';  // 连接状态
  serialNumber: string;    // 序列号
  brand?: string;          // 品牌
  screenSize?: string;     // 屏幕尺寸
  cpuInfo?: string;        // CPU信息
  memoryTotal?: number;    // 总内存(MB)
  storageTotal?: number;   // 总存储(GB)
  batteryLevel?: number;   // 当前电量(%)
}

// 已安装APP信息
export interface AppInfo {
  packageName: string;    // 包名
  appName: string;        // 应用名称
  versionName: string;    // 版本名
  versionCode: number;    // 版本号
  icon?: string;          // 图标base64
  targetSdkVersion?: number;
  minSdkVersion?: number;
}

// 阈值配置
export interface ThresholdConfig {
  // CPU阈值
  cpu: {
    appCpuUsage: number;        // APP CPU占用率默认60%
    systemCpuUsage: number;     // 整机CPU占用率默认70%
    backgroundCpuUsage: number; // 后台静置CPU消耗默认5%
  };
  // 电量阈值
  battery: {
    normalPowerPerMin: number;    // 常规场景每分钟耗电默认2%
    highLoadPowerPerMin: number;  // 高负载场景每分钟耗电默认5%
    invalidPowerRatio: number;    // 无效耗电占比默认10%
  };
  // 内存阈值
  memory: {
    peakPhysicalMemory: number;   // 峰值物理内存默认800MB
    backgroundMemory: number;     // 后台留存内存默认300MB
    startupMemoryIncrement: number; // 单次启动内存增量默认100MB
  };
  // GPU阈值
  gpu: {
    gpuUsage: number;           // GPU占用率默认80%
    minFps: number;             // 最低帧率默认30FPS
    fpsFluctuation: number;     // 帧率波动默认10FPS
    jankCountPerSecond: number; // 单秒卡顿次数默认2次
  };
  // 冷启动阈值
  coldStart: {
    totalTime: number;          // 冷启动总耗时默认2000ms
    firstFrameTime: number;     // 首帧渲染耗时默认800ms
    trafficConsumption: number; // 启动流量消耗默认5MB
  };
  // 热启动阈值
  hotStart: {
    totalTime: number;          // 热启动总耗时默认800ms
    firstScreenTime: number;    // 首屏加载耗时默认300ms
  };
}

// CPU监控数据
export interface CpuData {
  timestamp: number;
  appCpuUsage: number;       // APP单核CPU占用率(%)
  systemCpuUsage: number;    // 整机CPU占用率(%)
  peakCpuUsage: number;      // CPU峰值占用(%)
  backgroundCpuUsage: number; // 后台静置CPU消耗(%)
  coreUsages?: number[];     // 各核心占用率
}

// 电量监控数据
export interface BatteryData {
  timestamp: number;
  currentLevel: number;          // 当前电量(%)
  powerConsumptionPerMin: number; // 每分钟耗电量(%)
  totalPowerConsumption: number;  // 总耗电量(%)
  powerEfficiency: number;        // 电量使用效率(%)
  invalidPowerRatio: number;      // 无效耗电占比(%)
  peakPowerConsumption: number;   // 高负载耗电峰值(%)
  temperature?: number;           // 电池温度(℃)
  voltage?: number;               // 电压(mV)
}

// 内存监控数据
export interface MemoryData {
  timestamp: number;
  physicalMemory: number;      // 物理内存占用(MB)
  virtualMemory: number;       // 虚拟内存占用(MB)
  peakMemory: number;          // 内存峰值(MB)
  backgroundMemory: number;    // 后台留存内存(MB)
  startupMemoryIncrement: number; // 启动内存增量(MB)
  memoryLeaks?: boolean;       // 是否疑似内存泄漏
  nativeHeap?: number;         // Native堆内存(MB)
  dalvikHeap?: number;         // Dalvik堆内存(MB)
}

// GPU监控数据
export interface GpuData {
  timestamp: number;
  gpuUsage: number;           // GPU占用率(%)
  fps: number;                // 帧率(FPS)
  avgFps: number;             // 平均帧率
  minFps: number;             // 最低帧率
  fpsFluctuation: number;     // 帧率波动
  renderTime: number;         // 渲染耗时(ms)
  gpuPower: number;           // GPU功耗(mW)
  jankCount: number;          // 卡顿次数
  jankPeriods?: Array<{ start: number; end: number; count: number }>; // 卡顿时间段
}

// 冷启动测试数据
export interface ColdStartData {
  testId: string;
  timestamp: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  installTime: number;          // 安装耗时(ms)
  totalStartTime: number;       // 启动总耗时(ms)
  firstFrameTime: number;       // 首帧渲染耗时(ms)
  peakCpuUsage: number;         // 启动阶段CPU峰值(%)
  peakMemoryUsage: number;      // 启动阶段内存峰值(MB)
  peakBatteryUsage: number;     // 启动阶段电量消耗(%)
  trafficConsumption: number;   // 启动流量消耗(KB)
  failureRate: number;          // 启动失败率(%)
  errorMessage?: string;        // 错误信息
  apkInfo?: {
    name: string;
    size: number;
    version: string;
  };
  trafficConfig?: {
    networkThreshold: number;
    initialTraffic: number;
  };
}

// 热启动测试数据
export interface HotStartData {
  testId: string;
  timestamp: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  totalStartTime: number;       // 启动总耗时(ms)
  backgroundWakeTime: number;   // 后台唤醒耗时(ms)
  firstScreenTime: number;      // 首屏加载耗时(ms)
  resourceFluctuation: {
    cpuDelta: number;
    memoryDelta: number;
    batteryDelta: number;
  };
  errorMessage?: string;
}

// 超限告警记录
export interface ThresholdAlert {
  id: string;
  type: 'cpu' | 'battery' | 'memory' | 'gpu' | 'coldStart' | 'hotStart';
  metric: string;
  value: number;
  threshold: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  deviceId: string;
  packageName: string;
  severity: 'warning' | 'critical';
}

// 监控指标开关状态
export interface MonitorSwitches {
  cpu: boolean;
  battery: boolean;
  memory: boolean;
  gpu: boolean;
}

// 测试记录
export interface TestRecord {
  id: string;
  deviceId: string;
  deviceInfo: DeviceInfo;
  packageName: string;
  appInfo: AppInfo;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'interrupted';
  thresholdConfig: ThresholdConfig;
  cpuData: CpuData[];
  batteryData: BatteryData[];
  memoryData: MemoryData[];
  gpuData: GpuData[];
  coldStartData?: ColdStartData;
  hotStartData?: HotStartData;
  alerts: ThresholdAlert[];
  notes?: string;
}

// IPC通信通道枚举
export enum IpcChannel {
  // 设备相关
  SCAN_DEVICES = 'devices:scan',
  GET_DEVICES = 'devices:get',
  CONNECT_DEVICE = 'devices:connect',
  DISCONNECT_DEVICE = 'devices:disconnect',
  DEVICES_UPDATED = 'devices:updated',
  GET_ADB_DIAGNOSTICS = 'devices:adb-diagnostics',
  
  // APP相关
  GET_INSTALLED_APPS = 'apps:get-installed',
  DEBUG_APP_LIST = 'apps:debug-app-list',
  INSTALL_APK = 'apps:install-apk',
  UNINSTALL_APP = 'apps:uninstall',
  LAUNCH_APP = 'apps:launch',
  FORCE_STOP_APP = 'apps:force-stop',
  CLEAR_APP_DATA = 'apps:clear-data',
  
  // 监控相关
  START_MONITOR = 'monitor:start',
  STOP_MONITOR = 'monitor:stop',
  PAUSE_MONITOR = 'monitor:pause',
  RESUME_MONITOR = 'monitor:resume',
  CLEAR_MONITOR_DATA = 'monitor:clear',
  MONITOR_DATA_UPDATED = 'monitor:data-updated',
  MONITOR_AUTO_STOPPED = 'monitor:auto-stopped',  // 设备断开/连续采集失败时，主进程主动停止监控后广播给前端
  
  // 启动测试
  START_COLD_TEST = 'test:cold-start',
  START_HOT_TEST = 'test:hot-start',
  CANCEL_TEST = 'test:cancel',
  TEST_PROGRESS = 'test:progress',
  
  // 阈值配置
  GET_THRESHOLDS = 'thresholds:get',
  UPDATE_THRESHOLDS = 'thresholds:update',
  RESET_THRESHOLDS = 'thresholds:reset',
  
  // 告警
  ALERT_OCCURRED = 'alert:occurred',
  GET_ALERTS = 'alert:get',
  
  // 报告导出
  EXPORT_REPORT = 'report:export',
  GET_HISTORY_RECORDS = 'history:get',
  DELETE_HISTORY_RECORD = 'history:delete',
  
  // 文件选择
  SELECT_APK_FILE = 'file:select-apk',
  SELECT_SAVE_PATH = 'file:select-save',
  
  // 通用
  ERROR = 'common:error',
  LOG = 'common:log'
}

// 数据采集配置
export interface MonitorConfig {
  deviceId: string;
  packageName: string;
  sampleInterval: number;  // 采样间隔(ms)，默认100
  metrics: MonitorSwitches;
}

// 监控数据汇总
export interface MonitorDataPackage {
  cpu?: CpuData;
  battery?: BatteryData;
  memory?: MemoryData;
  gpu?: GpuData;
  timestamp: number;
}

// 报告导出配置
export interface ExportConfig {
  format: 'pdf' | 'ppt' | 'excel';
  savePath: string;
  recordId: string;
  includeCharts: boolean;
  includeAlerts: boolean;
}

// 默认阈值配置
export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  cpu: {
    appCpuUsage: 60,
    systemCpuUsage: 70,
    backgroundCpuUsage: 5
  },
  battery: {
    normalPowerPerMin: 2,
    highLoadPowerPerMin: 5,
    invalidPowerRatio: 10
  },
  memory: {
    peakPhysicalMemory: 800,
    backgroundMemory: 300,
    startupMemoryIncrement: 100
  },
  gpu: {
    gpuUsage: 80,
    minFps: 30,
    fpsFluctuation: 10,
    jankCountPerSecond: 2
  },
  coldStart: {
    totalTime: 2000,
    firstFrameTime: 800,
    trafficConsumption: 5
  },
  hotStart: {
    totalTime: 800,
    firstScreenTime: 300
  }
};

// 报告格式选项
export const EXPORT_FORMATS = {
  EXCEL: 'excel' as const,
  PDF: 'pdf' as const,
  PPT: 'ppt' as const
};

export type ExportFormatType = typeof EXPORT_FORMATS[keyof typeof EXPORT_FORMATS];
