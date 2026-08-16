import React, { useEffect, useState, useMemo } from 'react';
import { Row, Col, Button, Select, Tag, Tooltip, Space, message, Alert, Empty, Spin, Modal, Card, Divider } from 'antd';
import {
  RocketOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ClearOutlined,
  StopOutlined,
  SearchOutlined,
  BugOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  ToolOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { useAppStore, getStatusColor, STATUS_COLORS } from '../store/appStore';
import TrendChart from './TrendChart';
import type { DeviceInfo, AppInfo, MonitorSwitches, MonitorDataPackage, ThresholdAlert } from '../../shared/types';

type DebugResult = {
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
};

interface Props {
  selectedDevice: DeviceInfo | null;
}

const DashboardContent: React.FC<Props> = ({ selectedDevice }) => {
  const {
    installedApps,
    selectedPackageName,
    selectApp,
    setInstalledApps,
    isLoadingApps,
    setLoadingApps,
    monitorStatus,
    setMonitorStatus,
    resetMonitorData,
    appendMonitorData,
    addAlert,
    monitorSwitches,
    thresholds,
    cpuHistory,
    batteryHistory,
    memoryHistory,
    gpuHistory,
    selectedDeviceId,
    setCurrentView
  } = useAppStore();

  // ============ 应用列表诊断 ============
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleRunDiagnostics = async () => {
    if (!selectedDevice) {
      message.warning('请先选择设备');
      return;
    }
    if (!window.electronApi) {
      message.info('开发模拟：诊断功能需真机环境');
      return;
    }
    try {
      setDebugLoading(true);
      setDebugModalOpen(true);
      const r = await window.electronApi.debugAppList(selectedDevice.id);
      setDebugResult(r as DebugResult);
    } catch (e: any) {
      message.error('诊断失败：' + (e?.message || String(e)));
    } finally {
      setDebugLoading(false);
    }
  };

  const handleCopy = (label: string, value: string) => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(label);
        message.success('已复制到剪贴板');
        setTimeout(() => setCopied(null), 1500);
      },
      () => message.error('复制失败，请手动选择复制')
    );
  };

  const suggestionIcon = (s: string) => {
    if (s.startsWith('✅')) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (s.startsWith('❌')) return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    if (s.startsWith('⚠️')) return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
    return <InfoCircleOutlined style={{ color: '#1677ff' }} />;
  };

  const [appSearch, setAppSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [simulateTimer, setSimulateTimer] = useState<NodeJS.Timeout | null>(null);
  const [isAutoStopping, setIsAutoStopping] = useState(false);  // 防止自动停止时多次触发（双保险同时触发）
  const devices = useAppStore((s) => s.devices);  // 订阅设备列表变化（用于保险1：设备消失自动停）

  // 加载APP列表
  useEffect(() => {
    if (!selectedDevice) {
      setInstalledApps([]);
      return;
    }
    loadInstalledApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice?.id]);

  const loadInstalledApps = async () => {
    if (!selectedDevice) return;
    if (!window.electronApi) {
      // 模拟数据
      setLoadingApps(true);
      setTimeout(() => {
        const mockApps: AppInfo[] = [
          { packageName: 'com.tencent.mm', appName: '微信', versionName: '8.0.44', versionCode: 2720, targetSdkVersion: 33 },
          { packageName: 'com.eg.android.AlipayGphone', appName: '支付宝', versionName: '10.5.20', versionCode: 1000, targetSdkVersion: 33 },
          { packageName: 'com.ss.android.ugc.aweme', appName: '抖音', versionName: '27.8.0', versionCode: 2780, targetSdkVersion: 34 },
          { packageName: 'tv.danmaku.bili', appName: '哔哩哔哩', versionName: '7.30.0', versionCode: 7300, targetSdkVersion: 33 },
          { packageName: 'com.netease.cloudmusic', appName: '网易云音乐', versionName: '9.1.10', versionCode: 9110, targetSdkVersion: 33 },
          { packageName: 'com.tencent.tmgp.sgame', appName: '王者荣耀', versionName: '3.86.1', versionCode: 3861, targetSdkVersion: 33 },
          { packageName: 'com.miHoYo.GenshinImpact', appName: '原神', versionName: '4.2.0', versionCode: 420, targetSdkVersion: 33 },
          { packageName: 'com.tencent.mobileqq', appName: 'QQ', versionName: '9.0.10', versionCode: 9010, targetSdkVersion: 33 },
          { packageName: 'com.sina.weibo', appName: '微博', versionName: '13.10.0', versionCode: 13100, targetSdkVersion: 33 },
          { packageName: 'com.taobao.taobao', appName: '淘宝', versionName: '10.28.0', versionCode: 10280, targetSdkVersion: 33 },
          { packageName: 'com.jingdong.app.mall', appName: '京东', versionName: '12.3.0', versionCode: 12300, targetSdkVersion: 33 },
          { packageName: 'com.tencent.qqmusic', appName: 'QQ音乐', versionName: '12.8.0', versionCode: 12800, targetSdkVersion: 33 }
        ];
        setInstalledApps(mockApps);
        setLoadingApps(false);
      }, 1200);
      return;
    }

    try {
      setLoadingApps(true);
      const apps = await window.electronApi.getInstalledApps(selectedDevice.id);
      setInstalledApps(apps);
    } catch (error: any) {
      message.error('加载应用列表失败: ' + error.message);
    } finally {
      setLoadingApps(false);
    }
  };

  // 订阅监控数据更新
  useEffect(() => {
    if (!window.electronApi) return;
    const unsub = window.electronApi.onMonitorDataUpdated((deviceId: string, data: MonitorDataPackage) => {
      if (deviceId === selectedDeviceId) {
        appendMonitorData(data);
      }
    });
    const unsubAlert = window.electronApi.onAlertOccurred((alert: ThresholdAlert) => {
      addAlert(alert);
    });
    return () => {
      unsub && unsub();
      unsubAlert && unsubAlert();
    };
  }, [selectedDeviceId, appendMonitorData, addAlert]);

  const filteredApps = useMemo(() => {
    if (!appSearch) return installedApps;
    const s = appSearch.toLowerCase();
    return installedApps.filter(
      (a) => a.appName.toLowerCase().includes(s) || a.packageName.toLowerCase().includes(s)
    );
  }, [installedApps, appSearch]);

  const selectedAppInfo = installedApps.find((a) => a.packageName === selectedPackageName);

  const startMonitoring = async () => {
    if (!selectedDevice || !selectedPackageName) {
      message.warning('请先选择设备和目标APP');
      return;
    }

    if (!monitorSwitches.cpu && !monitorSwitches.battery && !monitorSwitches.memory && !monitorSwitches.gpu) {
      message.warning('请至少开启一项监控指标');
      return;
    }

    if (!window.electronApi) {
      // 模拟监控数据
      startSimulation();
      setMonitorStatus('running');
      message.success('实时监控已启动（模拟模式）');
      return;
    }

    try {
      setIsLoading(true);
      const ok = await window.electronApi.startMonitor({
        deviceId: selectedDevice.id,
        packageName: selectedPackageName,
        sampleInterval: 200,
        metrics: monitorSwitches
      });
      if (ok) {
        setMonitorStatus('running');
        message.success('实时监控已启动');
      } else {
        message.error('启动监控失败');
      }
    } catch (error: any) {
      message.error('启动监控失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 模拟模式：生成假数据
  const startSimulation = () => {
    const timer = setInterval(() => {
      const now = Date.now();
      const baseTime = now;
      const pkg: any = { timestamp: baseTime };

      if (monitorSwitches.cpu) {
        const appUsage = 15 + Math.random() * 60;
        const sysUsage = 30 + Math.random() * 40;
        pkg.cpu = {
          timestamp: baseTime,
          appCpuUsage: +appUsage.toFixed(1),
          systemCpuUsage: +sysUsage.toFixed(1),
          peakCpuUsage: Math.max(50, appUsage + (useAppStore.getState().cpuHistory.at(-1)?.peakCpuUsage || 0)),
          backgroundCpuUsage: +(1 + Math.random() * 6).toFixed(1)
        };
      }
      if (monitorSwitches.battery) {
        const state = useAppStore.getState();
        const prevLevel = state.batteryHistory.at(-1)?.currentLevel ?? 80;
        const level = Math.max(0, prevLevel - Math.random() * 0.1);
        pkg.battery = {
          timestamp: baseTime,
          currentLevel: +level.toFixed(1),
          powerConsumptionPerMin: +(1 + Math.random() * 3).toFixed(2),
          totalPowerConsumption: +(Math.random() * 5).toFixed(1),
          powerEfficiency: +(70 + Math.random() * 25).toFixed(1),
          invalidPowerRatio: +(Math.random() * 15).toFixed(1),
          peakPowerConsumption: +(Math.random() * 1).toFixed(2),
          temperature: +(30 + Math.random() * 15).toFixed(1),
          voltage: 3800 + Math.floor(Math.random() * 200)
        };
      }
      if (monitorSwitches.memory) {
        const state = useAppStore.getState();
        const prevPss = state.memoryHistory.at(-1)?.physicalMemory ?? 400;
        const pss = Math.min(1200, prevPss + (Math.random() - 0.4) * 20);
        pkg.memory = {
          timestamp: baseTime,
          physicalMemory: Math.round(pss),
          virtualMemory: Math.round(pss * 1.3),
          peakMemory: Math.max(600, pss),
          backgroundMemory: 250 + Math.round(Math.random() * 80),
          startupMemoryIncrement: 50 + Math.round(Math.random() * 80),
          memoryLeaks: Math.random() < 0.01,
          nativeHeap: 120 + Math.round(Math.random() * 50),
          dalvikHeap: 200 + Math.round(Math.random() * 100)
        };
      }
      if (monitorSwitches.gpu) {
        const fps = 30 + Math.round(Math.random() * 30);
        pkg.gpu = {
          timestamp: baseTime,
          gpuUsage: +(30 + Math.random() * 50).toFixed(1),
          fps,
          avgFps: fps + Math.round((Math.random() - 0.5) * 10),
          minFps: Math.max(10, fps - 15 - Math.round(Math.random() * 10)),
          fpsFluctuation: Math.round(5 + Math.random() * 15),
          renderTime: Math.round(10 + Math.random() * 25),
          gpuPower: 500 + Math.round(Math.random() * 800),
          jankCount: Math.random() < 0.3 ? Math.round(Math.random() * 4) : 0
        };
      }

      useAppStore.getState().appendMonitorData(pkg);
    }, 500);
    setSimulateTimer(timer);
  };

  const pauseMonitoring = async () => {
    if (!window.electronApi) {
      if (simulateTimer) {
        clearInterval(simulateTimer);
        setSimulateTimer(null);
      }
      setMonitorStatus('paused');
      message.info('监控已暂停');
      return;
    }
    try {
      await window.electronApi.pauseMonitor(selectedDevice!.id);
      setMonitorStatus('paused');
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const resumeMonitoring = async () => {
    if (!window.electronApi) {
      startSimulation();
      setMonitorStatus('running');
      message.info('监控已继续');
      return;
    }
    try {
      await window.electronApi.resumeMonitor(selectedDevice!.id);
      setMonitorStatus('running');
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const stopMonitoring = async (
    options: { auto?: boolean; customMessage?: string; externalRecordId?: string | null } = {}
  ) => {
    const { auto = false, customMessage, externalRecordId } = options;

    // 自动停止的防抖锁：防止「保险1 + 保险2」同时触发时调两次 save/send
    if (auto && isAutoStopping) return;
    if (auto) setIsAutoStopping(true);

    if (!window.electronApi) {
      if (simulateTimer) {
        clearInterval(simulateTimer);
        setSimulateTimer(null);
      }
      setMonitorStatus('completed');
      message.success(customMessage || '监控已停止，测试记录已保存');
      if (auto) setTimeout(() => setIsAutoStopping(false), 1500);
      return;
    }
    try {
      setIsLoading(true);
      // externalRecordId 存在 → 主进程已经自动保存过 record，不再重复调 stopMonitor（避免重复 save）
      if (externalRecordId) {
        useAppStore.getState().setCurrentRecordId(externalRecordId);
      } else if (selectedDevice) {
        const record = await window.electronApi.stopMonitor(selectedDevice.id);
        if (record) {
          useAppStore.getState().setCurrentRecordId(record.id);
        }
      }
      setMonitorStatus('completed');
      message.success(customMessage || '监控已停止，测试记录已保存');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setIsLoading(false);
      if (auto) setTimeout(() => setIsAutoStopping(false), 1500);
    }
  };

  const clearData = () => {
    if (!window.electronApi) {
      resetMonitorData();
      message.info('当前数据已清空');
      return;
    }
    window.electronApi.clearMonitorData(selectedDevice!.id);
    resetMonitorData();
    message.info('当前数据已清空');
  };

  // ⭐ 自动停止 - 保险1：当监控中选中设备从设备列表中消失（adb devices已找不到）时，立刻自动停止
  useEffect(() => {
    if (!selectedDeviceId) return;
    if (monitorStatus === 'idle' || monitorStatus === 'completed') return;
    const found = devices.find((d) => d.id === selectedDeviceId && d.status === 'connected');
    if (!found) {
      void stopMonitoring({
        auto: true,
        customMessage: '⚠️ 手机已断开连接，监控已自动停止并保存'
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, selectedDeviceId, monitorStatus]);

  // ⭐ 自动停止 - 保险2：订阅主进程的「连续 3 次采集失败自动停止」事件（adb 还能搜到设备，但所有命令均失败）
  useEffect(() => {
    if (!window.electronApi) return;
    const unsub = window.electronApi.onMonitorAutoStopped(
      (deviceId: string, _reason: 'offline' | 'consecutive-failures', message: string, recordId: string | null) => {
        if (deviceId !== selectedDeviceId) return;
        void stopMonitoring({
          auto: true,
          customMessage: '⚠️ ' + message,
          externalRecordId: recordId  // 主进程已经 save 过了，前端不重复 save
        });
      }
    );
    return () => { try { unsub?.(); } catch (_) { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId]);

  useEffect(() => {
    return () => {
      if (simulateTimer) clearInterval(simulateTimer);
    };
  }, [simulateTimer]);

  // 统计函数
  const getStats = (arr: any[], key: string) => {
    if (!arr || arr.length === 0) return { avg: 0, max: 0, min: 0, current: 0 };
    const vals = arr.map((d) => d[key]).filter((v) => typeof v === 'number' && !isNaN(v));
    if (vals.length === 0) return { avg: 0, max: 0, min: 0, current: 0 };
    return {
      avg: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
      max: Math.max(...vals),
      min: Math.min(...vals),
      current: vals[vals.length - 1]
    };
  };

  if (!selectedDevice) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📱</div>
        <h3>请选择要监控的设备</h3>
        <p>在左侧设备列表中选择一台已连接的手机设备</p>
        <p style={{ fontSize: 12, color: '#bfbfbf', marginTop: 16 }}>
          未检测到设备？请检查 USB 连接并开启 USB 调试模式
        </p>
      </div>
    );
  }

  const cpuStats = getStats(cpuHistory, 'appCpuUsage');
  const memStats = getStats(memoryHistory, 'physicalMemory');
  const battStats = getStats(batteryHistory, 'currentLevel');
  const gpuStats = getStats(gpuHistory, 'fps');
  const gpuUsageStats = getStats(gpuHistory, 'gpuUsage');

  const canStart = selectedPackageName !== null &&
    (monitorStatus === 'idle' || monitorStatus === 'completed');

  return (
    <div className="content-area">
      <div className="content-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {selectedDevice.model}
              <Tag color="blue" style={{ marginLeft: 8, marginTop: -2 }}>
                {selectedDevice.systemVersion}
              </Tag>
              {selectedDevice.batteryLevel !== undefined && (
                <Tag
                  style={{ marginLeft: 4, marginTop: -2 }}
                  color={selectedDevice.batteryLevel < 20 ? 'red' : selectedDevice.batteryLevel < 50 ? 'gold' : 'green'}
                >
                  🔋 {selectedDevice.batteryLevel}%
                </Tag>
              )}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
              {selectedDevice.brand} · {selectedDevice.serialNumber}
              {selectedDevice.memoryTotal && ` · ${Math.round(selectedDevice.memoryTotal / 1024)}GB RAM`}
            </p>
          </div>
        </div>

        <div className="toolbar">
          {monitorStatus === 'idle' || monitorStatus === 'completed' ? (
            <Button
              type="primary"
              size="large"
              icon={<RocketOutlined />}
              onClick={startMonitoring}
              loading={isLoading}
              disabled={!selectedPackageName}
            >
              开始监控
            </Button>
          ) : (
            <>
              {monitorStatus === 'paused' ? (
                <Button
                  type="primary"
                  size="large"
                  icon={<PlayCircleOutlined />}
                  onClick={resumeMonitoring}
                >
                  继续监控
                </Button>
              ) : (
                <Button
                  size="large"
                  icon={<PauseCircleOutlined />}
                  onClick={pauseMonitoring}
                >
                  暂停
                </Button>
              )}
              <Button
                size="large"
                danger
                icon={<StopOutlined />}
                onClick={() => stopMonitoring()}
                loading={isLoading}
              >
                停止并保存
              </Button>
            </>
          )}
          <Button
            size="large"
            icon={<ClearOutlined />}
            onClick={clearData}
            disabled={monitorStatus === 'running'}
          >
            清空数据
          </Button>

          <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
            <Button onClick={() => setCurrentView('coldStart')}>冷启动测试</Button>
            <Button onClick={() => setCurrentView('hotStart')}>热启动测试</Button>
          </Space>
        </div>
      </div>

      <div className="content-body">
        {/* APP选择器 */}
        <div className="app-selector" style={{ flexWrap: 'wrap', rowGap: 6 }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginRight: 8 }}>
              <BugOutlined style={{ marginRight: 4, color: '#1677ff' }} />
              选择目标APP:
            </label>
          </div>
          <Select
            showSearch
            allowClear
            placeholder="搜索并选择要监控的手机APP（可输入名称或包名）"
            value={selectedPackageName || undefined}
            onChange={(val) => selectApp(val || null)}
            onSearch={setAppSearch}
            filterOption={false}
            loading={isLoadingApps}
            style={{ flex: 1, minWidth: 360 }}
            suffixIcon={<SearchOutlined />}
            optionFilterProp="label"
            options={filteredApps.map((a) => ({
              value: a.packageName,
              label: `${a.appName} - ${a.packageName}`,
              appName: a.appName
            }))}
            listHeight={360}
            size="large"
            notFoundContent={
              isLoadingApps ? (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <Spin />
                  <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
                    正在从手机拉取应用列表（约 5-15 秒）...
                  </div>
                </div>
              ) : installedApps.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ fontSize: 12, color: '#8c8c8c' }}>暂无应用，点击右侧【刷新】按钮重试</span>} />
                </div>
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: '#8c8c8c', fontSize: 12 }}>无匹配APP</div>
              )
            }
            optionRender={(opt) => {
              const app = filteredApps.find((a) => a.packageName === opt.data.value);
              return (
                <div style={{ padding: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1f1f1f' }}>{app?.appName}</span>
                    {app?.versionName && (
                      <Tag color="geekblue" style={{ margin: 0, fontSize: 10 }}>
                        v{app.versionName}
                      </Tag>
                    )}
                    {app?.targetSdkVersion && (
                      <Tag style={{ margin: 0, fontSize: 10, background: '#fafafa', color: '#8c8c8c' }}>
                        targetSdk {app.targetSdkVersion}
                      </Tag>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: '#8c8c8c',
                      marginTop: 2
                    }}
                  >
                    {opt.data.value}
                  </div>
                </div>
              );
            }}
          />
          <Button
            size="large"
            icon={isLoadingApps ? <Spin size="small" /> : <ReloadOutlined />}
            onClick={loadInstalledApps}
            disabled={isLoadingApps || !selectedDevice}
            style={{ flex: '0 0 auto' }}
          >
            {isLoadingApps ? '加载中...' : '刷新APP列表'}
          </Button>
          <Tag icon={<AppstoreOutlined />} color="blue" style={{ flex: '0 0 auto', margin: 0 }}>
            共 {installedApps.length} 个APP
          </Tag>
          {selectedAppInfo && (
            <Tag color="green" style={{ flex: '0 0 auto', margin: 0 }}>
              已选: {selectedAppInfo.appName}
              {selectedAppInfo.versionName && ` v${selectedAppInfo.versionName}`}
            </Tag>
          )}
          {!selectedPackageName && !isLoadingApps && (
            <span style={{ fontSize: 12, color: '#faad14', flex: '0 0 auto' }}>
              ⚠️ 请先选择APP再开启监控
            </span>
          )}
        </div>

        {/* 加载进度提示 */}
        {isLoadingApps && (
          <Alert
            style={{ marginBottom: 12 }}
            type="info"
            showIcon
            icon={<Spin size="small" />}
            message="正在从手机读取已安装应用列表"
            description="首次加载需 5-15 秒（取决于手机APP数量，采用8并发拉取，中途不要拔数据线）。如果长时间没结果，请点右侧【刷新APP列表】重试。"
          />
        )}

        {/* 已选中但列表为空，给用户一个清晰操作入口 */}
        {!isLoadingApps && installedApps.length === 0 && (
          <Alert
            style={{ marginBottom: 12 }}
            type="warning"
            showIcon
            action={
              <Button
                size="small"
                icon={debugLoading ? <Spin size="small" /> : <ToolOutlined />}
                onClick={handleRunDiagnostics}
                type="primary"
                ghost
                disabled={!selectedDevice}
              >
                {debugLoading ? '诊断中...' : '一键诊断'}
              </Button>
            }
            message={<span style={{ fontWeight: 600 }}>当前还没有拉到手机上的任何应用</span>}
            description={
              <div style={{ lineHeight: 1.9 }}>
                ① 请先点右上角【刷新APP列表】重试（已优化为4并发+8s超时+权限fallback，命中率更高）；
                如果仍失败：② 确认手机 USB 调试点了【一律允许】 ③
                国产机型请开「开发者选项 → USB 安装 + USB 调试（安全设置）」；
                ④ 点右侧【一键诊断】查看 adb 原始命令输出，可直接截图定位。
              </div>
            }
          />
        )}

        {/* 监控状态提示 */}
        {monitorStatus !== 'idle' && (
          <Alert
            style={{ marginBottom: 16 }}
            type={monitorStatus === 'completed' ? 'success' : monitorStatus === 'paused' ? 'warning' : 'info'}
            showIcon
            message={
              <span>
                {monitorStatus === 'running' && '🔴 监控进行中... 正在实时采集性能数据'}
                {monitorStatus === 'paused' && '⏸️ 监控已暂停，可点击继续或停止保存'}
                {monitorStatus === 'completed' && '✅ 监控已完成并保存，可查看报告或清空数据'}
              </span>
            }
          />
        )}

        {/* 核心指标卡片 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} lg={6}>
            <div className="stat-card" style={{ borderTop: `3px solid ${STATUS_COLORS[getStatusColor(cpuStats.current, thresholds.cpu.appCpuUsage)]}` }}>
              <div className="stat-card-title">
                <h4>🧠 CPU 占用</h4>
                <span
                  className={`alert-badge ${getStatusColor(cpuStats.current, thresholds.cpu.appCpuUsage)}`}
                >
                  {getStatusColor(cpuStats.current, thresholds.cpu.appCpuUsage) === 'normal' ? '正常' : getStatusColor(cpuStats.current, thresholds.cpu.appCpuUsage) === 'warning' ? '超限' : '严重'}
                </span>
              </div>
              <div>
                <span
                  className="stat-value"
                  style={{ color: STATUS_COLORS[getStatusColor(cpuStats.current, thresholds.cpu.appCpuUsage)] }}
                >
                  {cpuStats.current?.toFixed(1) || 0}
                </span>
                <span className="stat-unit">%</span>
              </div>
              <div className="stat-summary">
                <div className="stat-summary-item">
                  <span className="label">均值</span>{cpuStats.avg}%
                </div>
                <div className="stat-summary-item">
                  <span className="label">峰值</span>{cpuStats.max?.toFixed(1) || 0}%
                </div>
                <div className="stat-summary-item">
                  <span className="label">阈值</span>{thresholds.cpu.appCpuUsage}%
                </div>
              </div>
            </div>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <div className="stat-card" style={{ borderTop: `3px solid #52c41a` }}>
              <div className="stat-card-title">
                <h4>🔋 电量状态</h4>
                <span className={`alert-badge ${(battStats.current || 0) > 20 ? 'normal' : (battStats.current || 0) > 10 ? 'warning' : 'critical'}`}>
                  {(battStats.current || 0) > 20 ? '电量正常' : (battStats.current || 0) > 10 ? '低电量' : '严重缺电'}
                </span>
              </div>
              <div>
                <span className="stat-value" style={{ color: (battStats.current || 0) > 20 ? '#52c41a' : '#ff4d4f' }}>
                  {battStats.current?.toFixed(1) || '--'}
                </span>
                <span className="stat-unit">%</span>
              </div>
              <div className="stat-summary">
                <div className="stat-summary-item">
                  <span className="label">总耗电</span>
                  {batteryHistory.length > 0 ? batteryHistory[batteryHistory.length - 1].totalPowerConsumption : 0}%
                </div>
                <div className="stat-summary-item">
                  <span className="label">每分钟</span>
                  {batteryHistory.length > 0 ? batteryHistory[batteryHistory.length - 1].powerConsumptionPerMin : 0}%
                </div>
                <div className="stat-summary-item">
                  <span className="label">温度</span>
                  {batteryHistory.length > 0 ? `${batteryHistory[batteryHistory.length - 1].temperature}℃` : '-'}
                </div>
              </div>
            </div>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <div className="stat-card" style={{ borderTop: `3px solid ${STATUS_COLORS[getStatusColor(memStats.current, thresholds.memory.peakPhysicalMemory)]}` }}>
              <div className="stat-card-title">
                <h4>💾 内存占用</h4>
                <span className={`alert-badge ${getStatusColor(memStats.current, thresholds.memory.peakPhysicalMemory)}`}>
                  {getStatusColor(memStats.current, thresholds.memory.peakPhysicalMemory) === 'normal' ? '正常' : '超限'}
                </span>
              </div>
              <div>
                <span
                  className="stat-value"
                  style={{ color: STATUS_COLORS[getStatusColor(memStats.current, thresholds.memory.peakPhysicalMemory)] }}
                >
                  {memStats.current || 0}
                </span>
                <span className="stat-unit">MB</span>
              </div>
              <div className="stat-summary">
                <div className="stat-summary-item">
                  <span className="label">均值</span>{memStats.avg}MB
                </div>
                <div className="stat-summary-item">
                  <span className="label">峰值</span>{memStats.max}MB
                </div>
                <div className="stat-summary-item">
                  <span className="label">阈值</span>{thresholds.memory.peakPhysicalMemory}MB
                </div>
              </div>
            </div>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <div className="stat-card" style={{ borderTop: `3px solid ${STATUS_COLORS[getStatusColor(gpuStats.current, thresholds.gpu.minFps, false)]}` }}>
              <div className="stat-card-title">
                <h4>🎮 GPU/帧率</h4>
                <span className={`alert-badge ${getStatusColor(gpuStats.current || 60, thresholds.gpu.minFps, false)}`}>
                  {getStatusColor(gpuStats.current || 60, thresholds.gpu.minFps, false) === 'normal' ? '流畅' : '掉帧'}
                </span>
              </div>
              <div>
                <span
                  className="stat-value"
                  style={{ color: STATUS_COLORS[getStatusColor(gpuStats.current || 60, thresholds.gpu.minFps, false)] }}
                >
                  {gpuStats.current || '--'}
                </span>
                <span className="stat-unit">FPS</span>
                <span style={{ fontSize: 13, color: '#8c8c8c', marginLeft: 12 }}>
                  GPU {gpuUsageStats.current?.toFixed(0) || 0}%
                </span>
              </div>
              <div className="stat-summary">
                <div className="stat-summary-item">
                  <span className="label">平均</span>{gpuStats.avg || 0}FPS
                </div>
                <div className="stat-summary-item">
                  <span className="label">波动</span>
                  {gpuHistory.length > 0 ? `${gpuHistory[gpuHistory.length - 1].fpsFluctuation}FPS` : '0'}
                </div>
                <div className="stat-summary-item">
                  <span className="label">卡顿</span>
                  {gpuHistory.length > 0 ? `${gpuHistory[gpuHistory.length - 1].jankCount}次/s` : 0}
                </div>
              </div>
            </div>
          </Col>
        </Row>

        {/* 趋势曲线图 */}
        {/* ⭐ 核心修复：空状态（未开始监控且无历史数据）时，直接不渲染 4 张空图表，
            否则 4 张空图表（共 520px 高）+ Empty 提示（240px 高）叠在一起，
            总内容超高，用户滚到第 2 张就以为到底了，误以为「最底部 2 张图表显示不出来」 */}
        {!(cpuHistory.length === 0 && monitorStatus === 'idle') && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} lg={12}>
                <div className="chart-container" style={{ padding: 12 }}>
                  <TrendChart
                    title="CPU 占用率趋势"
                    data={cpuHistory}
                    series={[
                      { key: 'appCpuUsage', name: 'APP CPU', color: '#fa8c16', unit: '%', area: true },
                      { key: 'systemCpuUsage', name: '整机CPU', color: '#722ed1', unit: '%' }
                    ]}
                    threshold={{ value: thresholds.cpu.appCpuUsage, label: `APP阈值 ${thresholds.cpu.appCpuUsage}%` }}
                  />
                </div>
              </Col>
              <Col xs={24} lg={12}>
                <div className="chart-container" style={{ padding: 12 }}>
                  <TrendChart
                    title="内存占用趋势"
                    data={memoryHistory}
                    series={[
                      { key: 'physicalMemory', name: '物理内存', color: '#13c2c2', unit: 'MB', area: true },
                      { key: 'nativeHeap', name: 'Native堆', color: '#1677ff' },
                      { key: 'dalvikHeap', name: 'Dalvik堆', color: '#eb2f96' }
                    ]}
                    threshold={{ value: thresholds.memory.peakPhysicalMemory, label: `峰值阈值 ${thresholds.memory.peakPhysicalMemory}MB` }}
                  />
                </div>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} lg={12}>
                <div className="chart-container" style={{ padding: 12 }}>
                  <TrendChart
                    title="电量消耗趋势"
                    data={batteryHistory}
                    series={[
                      { key: 'currentLevel', name: '当前电量', color: '#52c41a', unit: '%', area: true },
                      { key: 'powerConsumptionPerMin', name: '每分钟耗电', color: '#faad14' }
                    ]}
                  />
                </div>
              </Col>
              <Col xs={24} lg={12}>
                <div className="chart-container" style={{ padding: 12 }}>
                  <TrendChart
                    title="FPS & GPU 趋势"
                    data={gpuHistory}
                    series={[
                      { key: 'fps', name: '帧率 FPS', color: '#eb2f96', unit: '', area: true },
                      { key: 'gpuUsage', name: 'GPU占用 %', color: '#722ed1' },
                      { key: 'minFps', name: '最低FPS', color: '#ff4d4f', type: 'line' }
                    ]}
                    threshold={{ value: thresholds.gpu.minFps, label: `最低FPS阈值 ${thresholds.gpu.minFps}`, color: '#eb2f96' }}
                  />
                </div>
              </Col>
            </Row>
          </>
        )}

        {cpuHistory.length === 0 && monitorStatus === 'idle' && (
          <div
            style={{
              padding: 60,
              textAlign: 'center',
              background: '#fff',
              borderRadius: 10,
              border: '1px dashed #d9d9d9'
            }}
          >
            <Empty
              description={
                <div>
                  <h3 style={{ marginBottom: 8, color: '#595959' }}>开始实时性能监控</h3>
                  <p style={{ color: '#8c8c8c', fontSize: 13, margin: 0 }}>
                    请先选择目标 APP，点击右上角「开始监控」按钮
                    <br />
                    即可实时查看 CPU、电量、内存、GPU 性能数据
                  </p>
                </div>
              }
            />
          </div>
        )}

        {/* ========= 应用列表诊断 Modal ========= */}
        <Modal
          title={
            <Space>
              <ToolOutlined />
              <span style={{ fontWeight: 700 }}>APP 列表一键诊断报告</span>
              {selectedDevice && <Tag color="geekblue">设备: {selectedDevice.model}</Tag>}
            </Space>
          }
          open={debugModalOpen}
          onCancel={() => setDebugModalOpen(false)}
          confirmLoading={debugLoading}
          width={980}
          maskClosable={false}
          okText="复制建议到剪贴板"
          cancelText="关闭"
          destroyOnClose
          // Modal body 内部可滚动（外层 Modal 不产生页面滚动条，内容在内部滚动）
          bodyStyle={{ maxHeight: '75vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}
          onOk={() => {
            if (!debugResult) return;
            const text = '【建议】\n' + debugResult.suggestions.join('\n') +
              '\n\n【adb路径】' + debugResult.adbPath +
              '\n【pm list packages -3 数量】' + debugResult.packagesCount;
            handleCopy('suggestions-all', text);
          }}
          okButtonProps={{ disabled: !debugResult }}
        >
          {debugLoading && !debugResult && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, color: '#595959' }}>正在执行 3 条 adb 诊断命令（约 15-20 秒）...</div>
              <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12 }}>
                ① adb shell pm list packages -3 &nbsp; ② adb shell pm list packages &nbsp; ③ adb shell dumpsys package [样例包]
              </div>
            </div>
          )}
          {debugResult && (
            <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {/* ========= 智能建议列表 ========= */}
              <Alert
                type={debugResult.suggestions.some((s) => s.startsWith('❌')) ? 'error' : debugResult.suggestions.some((s) => s.startsWith('⚠️')) ? 'warning' : 'success'}
                showIcon
                style={{ marginBottom: 16 }}
                message={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {debugResult.suggestions.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.7 }}>
                        <span style={{ marginTop: 2 }}>{suggestionIcon(s)}</span>
                        <span style={{ flex: 1 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                }
              />
              <Divider orientation="left" style={{ margin: '8px 0 12px' }}>原始 adb 命令输出（可复制）</Divider>

              {/* ========= 命令 1 ========= */}
              <Card
                size="small"
                title={
                  <Space>
                    <Tag color="blue">1</Tag>
                    <code>{`adb -s <device> shell ${debugResult.packagesCmd}`}</code>
                    <Tag>检测到: {debugResult.packagesCount} 个包</Tag>
                  </Space>
                }
                style={{ marginBottom: 12 }}
                extra={
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy('packages-stdout', debugResult.packagesOutput)}>
                    {copied === 'packages-stdout' ? '已复制' : '复制stdout'}
                  </Button>
                }
              >
                {debugResult.packagesStderr !== '(空)' && (
                  <div style={{ marginBottom: 6 }}>
                    <Tag color="red">stderr</Tag>
                    <pre style={{ margin: '4px 0 0', background: '#fff1f0', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>{debugResult.packagesStderr}</pre>
                  </div>
                )}
                <pre style={{ maxHeight: 140, overflow: 'auto', margin: 0, background: '#fafafa', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                  {debugResult.packagesOutput || '(空，这是异常的，正常至少会有 package:xxx 多行业)'}
                </pre>
              </Card>

              {/* ========= 命令 2 ========= */}
              <Card
                size="small"
                title={
                  <Space>
                    <Tag color="purple">2</Tag>
                    <code>{`adb -s <device> shell ${debugResult.allPackagesCmd}`}</code>
                    <Tag>总行数: {(debugResult.allPackagesOutput.match(/^package:/gm) || []).length}</Tag>
                  </Space>
                }
                style={{ marginBottom: 12 }}
                extra={
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy('allpackages', debugResult.allPackagesOutput)}>
                    {copied === 'allpackages' ? '已复制' : '复制stdout'}
                  </Button>
                }
              >
                {debugResult.allPackagesStderr !== '(空)' && (
                  <div style={{ marginBottom: 6 }}>
                    <Tag color="red">stderr</Tag>
                    <pre style={{ margin: '4px 0 0', background: '#fff1f0', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>{debugResult.allPackagesStderr}</pre>
                  </div>
                )}
                <pre style={{ maxHeight: 180, overflow: 'auto', margin: 0, background: '#fafafa', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                  {debugResult.allPackagesOutput || '(空)'}
                </pre>
              </Card>

              {/* ========= 命令 3 ========= */}
              <Card
                size="small"
                title={
                  <Space>
                    <Tag color="cyan">3</Tag>
                    <code>{`adb -s <device> shell ${debugResult.sampleDumpsysCmd}`}</code>
                    <Tag>样例包 dumpsys（用于确认 versionName 解析正常）</Tag>
                  </Space>
                }
                extra={
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy('dumpsys', debugResult.sampleDumpsysOutput)}>
                    {copied === 'dumpsys' ? '已复制' : '复制stdout'}
                  </Button>
                }
              >
                {debugResult.sampleDumpsysStderr !== '(空)' && (
                  <div style={{ marginBottom: 6 }}>
                    <Tag color="red">stderr</Tag>
                    <pre style={{ margin: '4px 0 0', background: '#fff1f0', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>{debugResult.sampleDumpsysStderr}</pre>
                  </div>
                )}
                <pre style={{ maxHeight: 200, overflow: 'auto', margin: 0, background: '#fafafa', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                  {debugResult.sampleDumpsysOutput || '(空)'}
                </pre>
              </Card>

              <Divider style={{ margin: '12px 0' }} />
              <Alert
                type="info"
                showIcon
                message={`adb 路径: ${debugResult.adbPath}`}
                description={
                  <div>
                    若以上命令均返回空，请直接在 Mac 终端手动验证：
                    <pre style={{ marginTop: 8, background: '#fafafa', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
{`# 1. 确认设备在线
adb devices

# 2. 先看 adb 是否可用
${debugResult.adbPath} --version

# 3. 直接查询第三方包（替换<deviceID>为 adb devices 看到的那串）
${debugResult.adbPath} -s <deviceID> shell pm list packages -3

# 4. 如果为空，重启 adb 服务
${debugResult.adbPath} kill-server && ${debugResult.adbPath} start-server`}
                    </pre>
                  </div>
                }
              />
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default DashboardContent;
