import type { AdbManager } from './AdbManager';
import type {
  MonitorConfig,
  ThresholdConfig,
  MonitorDataPackage,
  CpuData,
  BatteryData,
  MemoryData,
  GpuData,
  ColdStartData,
  HotStartData,
  TestRecord,
  ThresholdAlert,
  DeviceInfo,
  AppInfo
} from '../../shared/types';

type DataCallback = (deviceId: string, data: MonitorDataPackage) => void;
type AlertCallback = (alert: ThresholdAlert) => void;
type AutoStopCallback = (
  deviceId: string,
  reason: 'offline' | 'consecutive-failures',
  message: string,
  record: TestRecord | null
) => void;

interface MonitorSession {
  config: MonitorConfig;
  thresholds: ThresholdConfig;
  intervalId: NodeJS.Timeout | null;
  paused: boolean;
  startTime: number;
  endTime?: number;
  deviceInfo?: DeviceInfo;
  appInfo?: AppInfo;

  // 累积的数据
  cpuData: CpuData[];
  batteryData: BatteryData[];
  memoryData: MemoryData[];
  gpuData: GpuData[];
  alerts: ThresholdAlert[];

  // 上一次电量、流量数据，用于计算消耗
  lastBatteryLevel?: number;
  lastTrafficRx?: number;
  lastTrafficTx?: number;
  initialBatteryLevel?: number;
  initialMemoryPss?: number;

  // 峰值数据
  peakCpu: number;
  peakMemory: number;
  peakGpu: number;

  // ⭐ 连续采集失败计数（3次自动停止）
  consecutiveFailures: number;
}

export class MonitorService {
  private sessions: Map<string, MonitorSession> = new Map();
  private dataCallbacks: DataCallback[] = [];
  private alertCallbacks: AlertCallback[] = [];
  private autoStopCallbacks: AutoStopCallback[] = [];

  constructor(private adb: AdbManager) {}

  onData(callback: DataCallback) {
    this.dataCallbacks.push(callback);
  }

  onAlert(callback: AlertCallback) {
    this.alertCallbacks.push(callback);
  }

  /** 主进程因设备离线/连续采集失败而自动停止监控时触发（同步到前端改状态） */
  onAutoStopped(callback: AutoStopCallback) {
    this.autoStopCallbacks.push(callback);
  }

  private emitData(deviceId: string, data: MonitorDataPackage) {
    this.dataCallbacks.forEach((cb) => cb(deviceId, data));
  }

  private emitAlert(alert: ThresholdAlert) {
    this.alertCallbacks.forEach((cb) => cb(alert));
  }

  private emitAutoStopped(
    deviceId: string,
    reason: 'offline' | 'consecutive-failures',
    message: string,
    record: TestRecord | null
  ) {
    this.autoStopCallbacks.forEach((cb) => cb(deviceId, reason, message, record));
  }

  private genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * 启动监控
   */
  async startMonitoring(config: MonitorConfig, thresholds: ThresholdConfig): Promise<boolean> {
    const { deviceId, packageName } = config;

    // 如果已有此设备的监控，先停止
    if (this.sessions.has(deviceId)) {
      this.stopMonitoring(deviceId);
    }

    // 获取设备和APP信息
    const devices = this.adb.getCachedDevices();
    const deviceInfo = devices.find((d) => d.id === deviceId);
    const appInfo = await this.adb.getAppInfo(deviceId, packageName);

    // 启动APP
    await this.adb.launchApp(deviceId, packageName);
    // 等待APP启动
    await this.delay(2000);

    // 获取初始状态
    const initialBattery = await this.adb.getBatteryInfo(deviceId);
    const initialMemory = await this.adb.getMemoryUsage(deviceId, packageName);
    const initialTraffic = await this.adb.getTrafficStats(deviceId, packageName);

    const session: MonitorSession = {
      config,
      thresholds,
      intervalId: null,
      paused: false,
      startTime: Date.now(),
      deviceInfo,
      appInfo: appInfo || {
        packageName,
        appName: packageName.split('.').pop() || packageName,
        versionName: '',
        versionCode: 0
      },

      cpuData: [],
      batteryData: [],
      memoryData: [],
      gpuData: [],
      alerts: [],

      lastBatteryLevel: initialBattery.level,
      lastTrafficRx: initialTraffic.rxBytes,
      lastTrafficTx: initialTraffic.txBytes,
      initialBatteryLevel: initialBattery.level,
      initialMemoryPss: initialMemory.pss,

      peakCpu: 0,
      peakMemory: 0,
      peakGpu: 0,

      consecutiveFailures: 0
    };

    this.sessions.set(deviceId, session);

    // 开始采样循环
    const sampleInterval = Math.max(config.sampleInterval || 100, 50);
    session.intervalId = setInterval(async () => {
      if (session.paused) return;
      try {
        const success = await this.collectData(session);
        if (success) {
          session.consecutiveFailures = 0;  // 只要本轮有数据成功就清零（一个指标坏了不算设备离线）
        } else {
          session.consecutiveFailures++;
        }
      } catch (e: any) {
        session.consecutiveFailures++;
        console.error('[采集异常] device=', deviceId, 'err=', e?.message || String(e));
      }

      // ⭐ 连续 3 次采集失败 → 判定设备离线/卡死，自动停止监控并保存数据
      if (session.consecutiveFailures >= 3) {
        const reason: 'offline' | 'consecutive-failures' = 'consecutive-failures';
        const message = `连续 ${session.consecutiveFailures} 次采集失败（手机可能已断开/未授权/卡死），监控已自动停止并保存数据`;
        console.warn('[AutoStop]', message);
        let record: TestRecord | null = null;
        try {
          record = await this.stopMonitoring(deviceId);  // 停止并生成测试 record（带所有采集数据）
        } catch (_) { /* 忽略stop过程的错误 */ }
        this.emitAutoStopped(deviceId, reason, message, record);
      }
    }, sampleInterval);

    return true;
  }

  private async collectData(session: MonitorSession): Promise<boolean> {
    const { deviceId, packageName, metrics } = session.config;
    const now = Date.now();
    const pkg: MonitorDataPackage = { timestamp: now };

    // 并行采集启用的指标（一个失败不影响其它，用 allSettled + 内部 try/catch 双保险）
    const tasks: Promise<void>[] = [];
    try {
    if (metrics.cpu) {
      tasks.push(
        (async () => {
          const cpuResult = await this.adb.getCpuUsage(deviceId, packageName);
          const cpuData: CpuData = {
            timestamp: now,
            appCpuUsage: cpuResult.appUsage,
            systemCpuUsage: cpuResult.systemUsage,
            peakCpuUsage: Math.max(session.peakCpu, cpuResult.appUsage),
            backgroundCpuUsage: 0 // 后台静置数据在特殊场景下统计
          };
          session.peakCpu = Math.max(session.peakCpu, cpuResult.appUsage);
          pkg.cpu = cpuData;
          session.cpuData.push(cpuData);

          // CPU阈值检查
          this.checkCpuThresholds(session, cpuData);
        })()
      );
    }

    if (metrics.battery) {
      tasks.push(
        (async () => {
          const battResult = await this.adb.getBatteryInfo(deviceId);
          const initial = session.initialBatteryLevel ?? battResult.level;
          const last = session.lastBatteryLevel ?? battResult.level;

          // 计算每分钟耗电量
          const elapsedMin = (now - session.startTime) / 60000;
          const totalConsumed = Math.max(initial - battResult.level, 0);
          const perMin = elapsedMin > 0 ? totalConsumed / elapsedMin : 0;

          const delta = Math.max(last - battResult.level, 0);
          // 电量使用效率：越接近1越好（100%表示所有耗电都在有效运行）
          const efficiency = battResult.status === 'discharging'
            ? Math.max(0, Math.min(100, 100 - perMin * 10))
            : 100;
          const invalidRatio = Math.max(0, 100 - efficiency);

          const batteryData: BatteryData = {
            timestamp: now,
            currentLevel: battResult.level,
            powerConsumptionPerMin: +perMin.toFixed(2),
            totalPowerConsumption: +totalConsumed.toFixed(1),
            powerEfficiency: +efficiency.toFixed(1),
            invalidPowerRatio: +invalidRatio.toFixed(1),
            peakPowerConsumption: Math.max(delta, 0),
            temperature: battResult.temperature,
            voltage: battResult.voltage
          };
          session.lastBatteryLevel = battResult.level;
          pkg.battery = batteryData;
          session.batteryData.push(batteryData);

          this.checkBatteryThresholds(session, batteryData);
        })()
      );
    }

    if (metrics.memory) {
      tasks.push(
        (async () => {
          const memResult = await this.adb.getMemoryUsage(deviceId, packageName);
          const initial = session.initialMemoryPss ?? memResult.pss;
          const increment = Math.max(memResult.pss - initial, 0);

          // 内存泄漏检测：物理内存持续上升超过10个采样周期
          let memoryLeaks = false;
          if (session.memoryData.length >= 20) {
            const recent = session.memoryData.slice(-20);
            let increasingCount = 0;
            for (let i = 1; i < recent.length; i++) {
              if (recent[i].physicalMemory > recent[i - 1].physicalMemory) {
                increasingCount++;
              }
            }
            memoryLeaks = increasingCount >= 15; // 75%以上上升
          }

          const memoryData: MemoryData = {
            timestamp: now,
            physicalMemory: memResult.pss,
            virtualMemory: memResult.privateDirty,
            peakMemory: Math.max(session.peakMemory, memResult.pss),
            backgroundMemory: 0,
            startupMemoryIncrement: increment,
            memoryLeaks,
            nativeHeap: memResult.nativeHeap,
            dalvikHeap: memResult.dalvikHeap
          };
          session.peakMemory = Math.max(session.peakMemory, memResult.pss);
          pkg.memory = memoryData;
          session.memoryData.push(memoryData);

          this.checkMemoryThresholds(session, memoryData);
        })()
      );
    }

    if (metrics.gpu) {
      tasks.push(
        (async () => {
          const gpuResult = await this.adb.getGpuInfo(deviceId, packageName);

          // 计算平均帧率和波动
          const recentFps = session.gpuData.slice(-30).map((d) => d.fps).filter((f) => f > 0);
          recentFps.push(gpuResult.fps);
          const avgFps = recentFps.length > 0
            ? recentFps.reduce((a, b) => a + b, 0) / recentFps.length
            : gpuResult.fps;
          const minFps = recentFps.length > 0 ? Math.min(...recentFps) : gpuResult.fps;
          const maxFps = recentFps.length > 0 ? Math.max(...recentFps) : gpuResult.fps;
          const fluctuation = maxFps - minFps;

          const gpuData: GpuData = {
            timestamp: now,
            gpuUsage: gpuResult.gpuUsage,
            fps: gpuResult.fps,
            avgFps: +avgFps.toFixed(1),
            minFps,
            fpsFluctuation: fluctuation,
            renderTime: gpuResult.renderTime,
            gpuPower: 0, // GPU功耗需要特殊硬件支持
            jankCount: gpuResult.jankCount
          };
          session.peakGpu = Math.max(session.peakGpu, gpuResult.gpuUsage);
          pkg.gpu = gpuData;
          session.gpuData.push(gpuData);

          this.checkGpuThresholds(session, gpuData);
        })()
      );
    }

    await Promise.allSettled(tasks);  // 一个指标采集失败不影响其他（allSettled 永不 reject）
    this.emitData(deviceId, pkg);

    // 本轮采集成功判定：pkg 里至少有一个除 timestamp 外的字段
    const hasAnyMetric = pkg.cpu !== undefined || pkg.battery !== undefined ||
                         pkg.memory !== undefined || pkg.gpu !== undefined;
    return hasAnyMetric;
  } catch (_err) {
    return false;  // 顶层出错（例如 tasks 构造失败）也按失败计数
  }
  }

  // ============== 阈值检查与告警 ==============

  private pushAlert(session: MonitorSession, alert: Omit<ThresholdAlert, 'id' | 'deviceId' | 'packageName' | 'startTime'>) {
    const a: ThresholdAlert = {
      id: this.genId(),
      deviceId: session.config.deviceId,
      packageName: session.config.packageName,
      startTime: Date.now(),
      ...alert
    };
    session.alerts.push(a);
    this.emitAlert(a);
  }

  private checkCpuThresholds(session: MonitorSession, data: CpuData) {
    const t = session.thresholds.cpu;
    if (data.appCpuUsage > t.appCpuUsage) {
      this.pushAlert(session, {
        type: 'cpu',
        metric: 'APP CPU占用率',
        value: data.appCpuUsage,
        threshold: t.appCpuUsage,
        severity: data.appCpuUsage > t.appCpuUsage * 1.3 ? 'critical' : 'warning'
      });
    }
    if (data.systemCpuUsage > t.systemCpuUsage) {
      this.pushAlert(session, {
        type: 'cpu',
        metric: '整机CPU占用率',
        value: data.systemCpuUsage,
        threshold: t.systemCpuUsage,
        severity: data.systemCpuUsage > t.systemCpuUsage * 1.2 ? 'critical' : 'warning'
      });
    }
  }

  private checkBatteryThresholds(session: MonitorSession, data: BatteryData) {
    const t = session.thresholds.battery;
    if (data.powerConsumptionPerMin > t.highLoadPowerPerMin) {
      this.pushAlert(session, {
        type: 'battery',
        metric: '每分钟耗电量(高负载)',
        value: data.powerConsumptionPerMin,
        threshold: t.highLoadPowerPerMin,
        severity: 'critical'
      });
    } else if (data.powerConsumptionPerMin > t.normalPowerPerMin) {
      this.pushAlert(session, {
        type: 'battery',
        metric: '每分钟耗电量(常规)',
        value: data.powerConsumptionPerMin,
        threshold: t.normalPowerPerMin,
        severity: 'warning'
      });
    }
    if (data.invalidPowerRatio > t.invalidPowerRatio) {
      this.pushAlert(session, {
        type: 'battery',
        metric: '无效耗电占比',
        value: data.invalidPowerRatio,
        threshold: t.invalidPowerRatio,
        severity: 'warning'
      });
    }
  }

  private checkMemoryThresholds(session: MonitorSession, data: MemoryData) {
    const t = session.thresholds.memory;
    if (data.physicalMemory > t.peakPhysicalMemory) {
      this.pushAlert(session, {
        type: 'memory',
        metric: '峰值物理内存',
        value: data.physicalMemory,
        threshold: t.peakPhysicalMemory,
        severity: data.physicalMemory > t.peakPhysicalMemory * 1.2 ? 'critical' : 'warning'
      });
    }
    if (data.startupMemoryIncrement > t.startupMemoryIncrement) {
      this.pushAlert(session, {
        type: 'memory',
        metric: '启动内存增量',
        value: data.startupMemoryIncrement,
        threshold: t.startupMemoryIncrement,
        severity: 'warning'
      });
    }
    if (data.memoryLeaks) {
      this.pushAlert(session, {
        type: 'memory',
        metric: '疑似内存泄漏',
        value: 1,
        threshold: 0,
        severity: 'critical'
      });
    }
  }

  private checkGpuThresholds(session: MonitorSession, data: GpuData) {
    const t = session.thresholds.gpu;
    if (data.gpuUsage > t.gpuUsage) {
      this.pushAlert(session, {
        type: 'gpu',
        metric: 'GPU占用率',
        value: data.gpuUsage,
        threshold: t.gpuUsage,
        severity: data.gpuUsage > t.gpuUsage * 1.15 ? 'critical' : 'warning'
      });
    }
    if (data.fps > 0 && data.fps < t.minFps) {
      this.pushAlert(session, {
        type: 'gpu',
        metric: '最低帧率',
        value: data.fps,
        threshold: t.minFps,
        severity: 'critical'
      });
    }
    if (data.fpsFluctuation > t.fpsFluctuation) {
      this.pushAlert(session, {
        type: 'gpu',
        metric: '帧率波动',
        value: data.fpsFluctuation,
        threshold: t.fpsFluctuation,
        severity: 'warning'
      });
    }
    if (data.jankCount > t.jankCountPerSecond) {
      this.pushAlert(session, {
        type: 'gpu',
        metric: '单秒卡顿次数',
        value: data.jankCount,
        threshold: t.jankCountPerSecond,
        severity: 'warning'
      });
    }
  }

  pauseMonitoring(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (!session) return false;
    session.paused = true;
    return true;
  }

  resumeMonitoring(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (!session) return false;
    session.paused = false;
    return true;
  }

  clearData(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (!session) return false;
    session.cpuData = [];
    session.batteryData = [];
    session.memoryData = [];
    session.gpuData = [];
    session.alerts = [];
    session.startTime = Date.now();
    return true;
  }

  async stopMonitoring(deviceId: string): Promise<TestRecord | null> {
    const session = this.sessions.get(deviceId);
    if (!session) return null;

    if (session.intervalId) {
      clearInterval(session.intervalId);
      session.intervalId = null;
    }

    const record: TestRecord = {
      id: this.genId(),
      deviceId: session.config.deviceId,
      deviceInfo: session.deviceInfo || {
        id: session.config.deviceId,
        model: '未知设备',
        systemVersion: '未知',
        status: 'connected',
        serialNumber: session.config.deviceId
      },
      packageName: session.config.packageName,
      appInfo: session.appInfo || {
        packageName: session.config.packageName,
        appName: '未知APP',
        versionName: '未知版本',
        versionCode: 0
      },
      startTime: session.startTime,
      endTime: Date.now(),
      status: 'completed',
      thresholdConfig: JSON.parse(JSON.stringify(session.thresholds)),
      cpuData: session.cpuData,
      batteryData: session.batteryData,
      memoryData: session.memoryData,
      gpuData: session.gpuData,
      alerts: session.alerts
    };

    this.sessions.delete(deviceId);
    return record;
  }

  stopAllMonitoring() {
    for (const deviceId of this.sessions.keys()) {
      this.stopMonitoring(deviceId).catch(() => {});
    }
  }

  /**
   * 冷启动测试
   */
  async runColdStartTest(
    deviceId: string,
    apkPath: string,
    packageName: string,
    thresholds: ThresholdConfig['coldStart'],
    trafficConfig?: { networkThreshold: number; initialTraffic: number }
  ): Promise<ColdStartData> {
    const result: ColdStartData = {
      testId: this.genId(),
      timestamp: Date.now(),
      status: 'running',
      installTime: 0,
      totalStartTime: 0,
      firstFrameTime: 0,
      peakCpuUsage: 0,
      peakMemoryUsage: 0,
      peakBatteryUsage: 0,
      trafficConsumption: 0,
      failureRate: 0,
      apkInfo: undefined,
      trafficConfig
    };

    try {
      // 1. 获取APK信息
      const fs = await import('fs');
      try {
        const stat = fs.statSync(apkPath);
        result.apkInfo = {
          name: apkPath.split('/').pop() || apkPath.split('\\').pop() || 'unknown.apk',
          size: stat.size,
          version: ''
        };
      } catch {
        // 忽略
      }

      // 2. 卸载原有APP
      await this.adb.uninstallApp(deviceId, packageName);
      await this.delay(1000);

      // 3. 安装APK并计时
      const installStart = Date.now();
      const installSuccess = await this.adb.installApk(deviceId, apkPath);
      result.installTime = Date.now() - installStart;

      if (!installSuccess) {
        result.status = 'failed';
        result.errorMessage = 'APK安装失败';
        return result;
      }
      await this.delay(500);

      // 4. 锁定屏幕防干扰
      await this.adb.setScreenLock(deviceId, true).catch(() => {});

      // 5. 初始状态记录
      const initialTraffic = await this.adb.getTrafficStats(deviceId, packageName);
      const initialBattery = await this.adb.getBatteryInfo(deviceId);
      const initialTrafficTotal = (trafficConfig?.initialTraffic || 0) + initialTraffic.rxBytes + initialTraffic.txBytes;

      // 6. 启动APP并计时
      const startStart = Date.now();
      const launchTime = await this.adb.launchAppWithTime(deviceId, packageName);
      const realLaunchTime = Date.now() - startStart;

      result.totalStartTime = launchTime > 0 ? launchTime : realLaunchTime;
      // 首帧渲染约占启动时间的40%（经验估算）
      result.firstFrameTime = Math.round(result.totalStartTime * 0.4);

      // 7. 启动后立即采集资源占用峰值
      const peakSamples: Array<{ cpu: number; mem: number; bat: number }> = [];
      for (let i = 0; i < 10; i++) {
        const [cpu, mem, bat] = await Promise.all([
          this.adb.getCpuUsage(deviceId, packageName),
          this.adb.getMemoryUsage(deviceId, packageName),
          this.adb.getBatteryInfo(deviceId)
        ]);
        peakSamples.push({
          cpu: cpu.appUsage,
          mem: mem.pss,
          bat: bat.level
        });
        await this.delay(200);
      }

      result.peakCpuUsage = peakSamples.reduce((m, s) => Math.max(m, s.cpu), 0);
      result.peakMemoryUsage = peakSamples.reduce((m, s) => Math.max(m, s.mem), 0);
      const batStart = initialBattery.level;
      const batEnd = peakSamples[peakSamples.length - 1].bat;
      result.peakBatteryUsage = Math.max(batStart - batEnd, 0);

      // 8. 流量消耗统计
      const afterTraffic = await this.adb.getTrafficStats(deviceId, packageName);
      const trafficUsed = (afterTraffic.rxBytes + afterTraffic.txBytes) - (initialTraffic.rxBytes + initialTraffic.txBytes);
      result.trafficConsumption = Math.round((Math.max(trafficUsed, 0) + (trafficConfig?.initialTraffic || 0)) / 1024); // KB

      result.status = 'success';
      return result;
    } catch (error: any) {
      result.status = 'failed';
      result.errorMessage = error.message || '冷启动测试异常';
      return result;
    }
  }

  /**
   * 热启动测试
   */
  async runHotStartTest(
    deviceId: string,
    packageName: string,
    thresholds: ThresholdConfig['hotStart']
  ): Promise<HotStartData> {
    const result: HotStartData = {
      testId: this.genId(),
      timestamp: Date.now(),
      status: 'running',
      totalStartTime: 0,
      backgroundWakeTime: 0,
      firstScreenTime: 0,
      resourceFluctuation: {
        cpuDelta: 0,
        memoryDelta: 0,
        batteryDelta: 0
      }
    };

    try {
      // 1. 确认APP已安装
      const installed = await this.adb.isAppInstalled(deviceId, packageName);
      if (!installed) {
        result.status = 'failed';
        result.errorMessage = '设备未安装目标APP';
        return result;
      }

      // 2. 强制停止APP并清理后台
      await this.adb.forceStopApp(deviceId, packageName);
      await this.delay(1500);

      // 3. 记录测试前状态
      const [preCpu, preMem, preBat] = await Promise.all([
        this.adb.getCpuUsage(deviceId, packageName),
        this.adb.getMemoryUsage(deviceId, packageName),
        this.adb.getBatteryInfo(deviceId)
      ]);

      // 4. 锁定屏幕
      await this.adb.setScreenLock(deviceId, true).catch(() => {});

      // 5. 启动并计时
      const wakeStart = Date.now();
      const launchTime = await this.adb.launchAppWithTime(deviceId, packageName);
      const realLaunchTime = Date.now() - wakeStart;

      result.totalStartTime = launchTime > 0 ? launchTime : realLaunchTime;
      result.backgroundWakeTime = Math.round(result.totalStartTime * 0.35); // 后台唤醒约35%
      result.firstScreenTime = Math.round(result.totalStartTime * 0.6); // 首屏约60%

      // 6. 启动后采集状态
      await this.delay(500);
      const [postCpu, postMem, postBat] = await Promise.all([
        this.adb.getCpuUsage(deviceId, packageName),
        this.adb.getMemoryUsage(deviceId, packageName),
        this.adb.getBatteryInfo(deviceId)
      ]);

      result.resourceFluctuation = {
        cpuDelta: Math.abs(postCpu.appUsage - preCpu.appUsage),
        memoryDelta: Math.abs(postMem.pss - preMem.pss),
        batteryDelta: Math.max(preBat.level - postBat.level, 0)
      };

      result.status = 'success';
      return result;
    } catch (error: any) {
      result.status = 'failed';
      result.errorMessage = error.message || '热启动测试异常';
      return result;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
