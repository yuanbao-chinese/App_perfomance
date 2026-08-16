import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannel } from '../shared/types';
import type {
  DeviceInfo,
  AppInfo,
  ThresholdConfig,
  MonitorConfig,
  ColdStartData,
  HotStartData,
  ExportConfig,
  TestRecord,
  MonitorDataPackage,
  ThresholdAlert
} from '../shared/types';

// ⭐⭐⭐ 打包后骨架屏卡死根因 #4：preload 必须 100% 成功挂载 window.electronAPI
// 如果 contextBridge 抛错（极少数 contextIsolation 配置异常、asar 路径问题），渲染端会出现：
//   window.electronApi = undefined → 组件 import 时同步访问该对象的属性 → TypeError: Cannot read properties of undefined → React 永不挂载
// 本文件 3 层兜底：① try-catch 包裹 exposeInMainWorld；② 失败则降级用 window 赋值；③ api 内所有 Promise 返回兜底值，永不 throw 同步错误

// 封装IPC调用，带超时。约定：最后一个参数如果是纯数字，作为本次调用的自定义超时毫秒数
function invokeWithTimeout<T>(channel: string, ...args: any[]): Promise<T> {
  try {
    // 从 args 末尾提取自定义超时
    let customTimeout: number | undefined;
    if (args.length > 0 && typeof args[args.length - 1] === 'number') {
      customTimeout = args.pop() as number;
    }
    const timeoutMs = customTimeout ?? 60000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(
          `请求超时（${(timeoutMs / 1000).toFixed(0)}秒），通道：${channel}。` +
          '如果是加载应用列表，通常是手机应用太多 / USB 线传输慢，可点击【一键诊断】查看原始 adb 输出。'
        ));
      }, timeoutMs);

      // ipcRenderer.invoke 本身同步抛错兜底（极端情况：ipcRenderer 未初始化）
      let invokePromise: Promise<any>;
      try {
        invokePromise = ipcRenderer.invoke(channel, ...args);
      } catch (syncErr: any) {
        clearTimeout(timer);
        reject(new Error('[preload:invoke:sync] ' + (syncErr?.message || String(syncErr))));
        return;
      }

      invokePromise
        .then((result) => {
          clearTimeout(timer);
          resolve(result as T);
        })
        .catch((err) => {
          clearTimeout(timer);
          // 把 Node Error 的 message 和 stack 带上，避免渲染端只看到「Error: xxx 对象 unserialized」
          const msg = err?.message ?? String(err ?? '未知错误');
          const stack = err?.stack ? '\n' + String(err.stack) : '';
          reject(new Error(msg + stack));
        });
    });
  } catch (outerErr: any) {
    // Promise 构造 + ipcRenderer 访问 任何同步错误兜底
    return Promise.reject(new Error('[preload:invoke:outer] ' + (outerErr?.message || String(outerErr))));
  }
}

function noop() { return undefined as any; }
function noopAsync<T>(fallback: T | null = null): Promise<T | null> { return Promise.resolve(fallback); }
function noopListener() { return noop; }

const api = {
  // 设备相关
  scanDevices: (): Promise<DeviceInfo[]> => invokeWithTimeout(IpcChannel.SCAN_DEVICES).catch(() => [] as DeviceInfo[]) as any,
  getDevices: (): Promise<DeviceInfo[]> => invokeWithTimeout(IpcChannel.GET_DEVICES).catch(() => [] as DeviceInfo[]) as any,
  connectDevice: (deviceId: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.CONNECT_DEVICE, deviceId).catch(() => false) as any,
  disconnectDevice: (deviceId: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.DISCONNECT_DEVICE, deviceId).catch(() => false) as any,
  getAdbDiagnostics: (): Promise<{
    adbFound: boolean;
    adbPath: string;
    version?: string;
    installHint: string;
    deviceCheckHint: string;
  }> => invokeWithTimeout(IpcChannel.GET_ADB_DIAGNOSTICS).catch(() => ({
    adbFound: false, adbPath: '', installHint: '', deviceCheckHint: 'preload IPC失败，点击诊断查看原始信息'
  })) as any,
  onDevicesUpdated: (callback: (devices: DeviceInfo[]) => void) => {
    try {
      const handler = (_event: IpcRendererEvent, devices: DeviceInfo[]) => callback(devices);
      ipcRenderer.on(IpcChannel.DEVICES_UPDATED, handler);
      return () => { try { ipcRenderer.removeListener(IpcChannel.DEVICES_UPDATED, handler); } catch (_) {} };
    } catch (_) { return noop; }
  },

  // APP相关
  getInstalledApps: (deviceId: string): Promise<AppInfo[]> =>
    invokeWithTimeout(IpcChannel.GET_INSTALLED_APPS, deviceId, 180000).catch(() => [] as AppInfo[]) as any,
  debugAppList: (deviceId: string): Promise<{
    adbPath: string;
    packagesCmd: string;
    packagesOutput: string;
    packagesStderr: string;
    packagesCount: number;
    allPackagesCmd: string;
    allPackagesOutput: string;
    allPackagesStderr: string;
    sampleDumpsysCmd: string;
    sampleDumpsysOutput: string;
    sampleDumpsysStderr: string;
    suggestions: string[];
  }> => invokeWithTimeout(IpcChannel.DEBUG_APP_LIST, deviceId, 45000).catch(() => ({
    adbPath: '', packagesCmd: '', packagesOutput: '', packagesStderr: '', packagesCount: 0,
    allPackagesCmd: '', allPackagesOutput: '', allPackagesStderr: '',
    sampleDumpsysCmd: '', sampleDumpsysOutput: '', sampleDumpsysStderr: '', suggestions: []
  })) as any,
  installApk: (deviceId: string, apkPath: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.INSTALL_APK, deviceId, apkPath, 300000).catch(() => false) as any,
  uninstallApp: (deviceId: string, packageName: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.UNINSTALL_APP, deviceId, packageName).catch(() => false) as any,
  launchApp: (deviceId: string, packageName: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.LAUNCH_APP, deviceId, packageName).catch(() => false) as any,
  forceStopApp: (deviceId: string, packageName: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.FORCE_STOP_APP, deviceId, packageName).catch(() => false) as any,
  clearAppData: (deviceId: string, packageName: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.CLEAR_APP_DATA, deviceId, packageName).catch(() => false) as any,

  // 监控相关
  startMonitor: (config: MonitorConfig): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.START_MONITOR, config).catch(() => false) as any,
  stopMonitor: (deviceId: string): Promise<TestRecord | null> =>
    invokeWithTimeout(IpcChannel.STOP_MONITOR, deviceId).catch(() => null) as any,
  pauseMonitor: (deviceId: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.PAUSE_MONITOR, deviceId).catch(() => false) as any,
  resumeMonitor: (deviceId: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.RESUME_MONITOR, deviceId).catch(() => false) as any,
  clearMonitorData: (deviceId: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.CLEAR_MONITOR_DATA, deviceId).catch(() => false) as any,
  onMonitorDataUpdated: (
    callback: (deviceId: string, data: MonitorDataPackage) => void
  ) => {
    try {
      const handler = (
        _event: IpcRendererEvent,
        deviceId: string,
        data: MonitorDataPackage
      ) => callback(deviceId, data);
      ipcRenderer.on(IpcChannel.MONITOR_DATA_UPDATED, handler);
      return () => { try { ipcRenderer.removeListener(IpcChannel.MONITOR_DATA_UPDATED, handler); } catch (_) {} };
    } catch (_) { return noop; }
  },
  onMonitorAutoStopped: (
    callback: (deviceId: string, reason: 'offline' | 'consecutive-failures', message: string) => void
  ) => {
    try {
      const handler = (
        _event: IpcRendererEvent,
        deviceId: string,
        reason: 'offline' | 'consecutive-failures',
        message: string
      ) => callback(deviceId, reason, message);
      ipcRenderer.on(IpcChannel.MONITOR_AUTO_STOPPED, handler);
      return () => { try { ipcRenderer.removeListener(IpcChannel.MONITOR_AUTO_STOPPED, handler); } catch (_) {} };
    } catch (_) { return noop; }
  },

  // 启动测试
  startColdTest: (
    deviceId: string,
    apkPath: string,
    packageName: string,
    trafficConfig?: { networkThreshold: number; initialTraffic: number }
  ): Promise<ColdStartData | null> =>
    invokeWithTimeout(IpcChannel.START_COLD_TEST, deviceId, apkPath, packageName, trafficConfig).catch(() => null) as any,
  startHotTest: (deviceId: string, packageName: string): Promise<HotStartData | null> =>
    invokeWithTimeout(IpcChannel.START_HOT_TEST, deviceId, packageName).catch(() => null) as any,

  // 阈值配置
  getThresholds: (): Promise<ThresholdConfig> => invokeWithTimeout(IpcChannel.GET_THRESHOLDS).catch(() => ({} as ThresholdConfig)) as any,
  updateThresholds: (config: Partial<ThresholdConfig>): Promise<ThresholdConfig> =>
    invokeWithTimeout(IpcChannel.UPDATE_THRESHOLDS, config).catch(() => ({} as ThresholdConfig)) as any,
  resetThresholds: (): Promise<ThresholdConfig> => invokeWithTimeout(IpcChannel.RESET_THRESHOLDS).catch(() => ({} as ThresholdConfig)) as any,

  // 告警
  onAlertOccurred: (callback: (alert: ThresholdAlert) => void) => {
    try {
      const handler = (_event: IpcRendererEvent, alert: ThresholdAlert) => callback(alert);
      ipcRenderer.on(IpcChannel.ALERT_OCCURRED, handler);
      return () => { try { ipcRenderer.removeListener(IpcChannel.ALERT_OCCURRED, handler); } catch (_) {} };
    } catch (_) { return noop; }
  },

  // 历史记录
  getHistoryRecords: (): Promise<TestRecord[]> => invokeWithTimeout(IpcChannel.GET_HISTORY_RECORDS).catch(() => [] as TestRecord[]) as any,
  deleteHistoryRecord: (recordId: string): Promise<boolean> =>
    invokeWithTimeout(IpcChannel.DELETE_HISTORY_RECORD, recordId).catch(() => false) as any,

  // 报告导出
  exportReport: (config: ExportConfig): Promise<string | null> =>
    invokeWithTimeout(IpcChannel.EXPORT_REPORT, config).catch(() => null) as any,

  // 文件选择
  selectApkFile: (): Promise<string | null> => invokeWithTimeout(IpcChannel.SELECT_APK_FILE).catch(() => null) as any,
  selectSavePath: (
    defaultName: string,
    filters: Array<{ name: string; extensions: string[] }>
  ): Promise<string | null> =>
    invokeWithTimeout(IpcChannel.SELECT_SAVE_PATH, defaultName, filters).catch(() => null) as any,

  // 错误监听
  onError: (callback: (error: { message: string; timestamp: number }) => void) => {
    try {
      const handler = (
        _event: IpcRendererEvent,
        error: { message: string; timestamp: number }
      ) => callback(error);
      ipcRenderer.on(IpcChannel.ERROR, handler);
      return () => { try { ipcRenderer.removeListener(IpcChannel.ERROR, handler); } catch (_) {} };
    } catch (_) { return noop; }
  }
};

export type ElectronApi = typeof api;

// ⭐⭐⭐ 三层兜底挂载 window.electronAPI，永远不让它是 undefined
function exposeElectronApi() {
  // 第 1 层：正常用 contextBridge（contextIsolation=true 时唯一正规途径）
  try {
    contextBridge.exposeInMainWorld('electronApi', api);
    return;
  } catch (e: any) {
    console.warn('[preload] contextBridge.exposeInMainWorld 失败，尝试降级挂载:', e?.message || String(e));
  }

  // 第 2 层：直接写 window（极端兜底：contextIsolation 没开或者异常时）
  try {
    // 用 Object.defineProperty 避免被某些安全策略拦截赋值
    Object.defineProperty((window as any), 'electronApi', {
      value: api,
      writable: false,
      configurable: false,
      enumerable: true
    });
    return;
  } catch (e2: any) {
    console.warn('[preload] window.electronApi defineProperty 失败，尝试直接赋值:', e2?.message || String(e2));
  }

  // 第 3 层：直接赋值，再不行就真的没办法了
  try {
    (window as any).electronApi = api;
  } catch (e3: any) {
    console.error('[preload] 全部挂载兜底失败，window.electronApi 无法注入：', e3?.stack || String(e3));
  }
}

exposeElectronApi();
