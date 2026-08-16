import React, { useState, useEffect } from 'react';
import {
  Tabs, Button, Space, Badge, App as AntApp, Dropdown, Avatar, Tooltip, Segmented, Modal
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined, RocketOutlined, HistoryOutlined, BellOutlined,
  SettingOutlined, InfoCircleOutlined, MenuOutlined, CloudSyncOutlined
} from '@ant-design/icons';
import DevicePanel from './components/DevicePanel';
import MetricsBar from './components/MetricsBar';
import DashboardContent from './components/DashboardContent';
import StartTestPage from './components/StartTestPage';
import HistoryPage from './components/HistoryPage';
import AlertsPanel from './components/AlertsPanel';
import { useAppStore } from './store/appStore';
import type { DeviceInfo } from '../shared/types';

type TabKey = 'dashboard' | 'start-test' | 'history';

const App: React.FC = () => {
  const {
    devices,
    selectedDeviceId,
    alerts,
    setThresholds,
    currentView,
    setCurrentView,
    selectDevice,
    selectedPackageName
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const app = AntApp.useApp?.();

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || null;

  // 初始加载阈值
  useEffect(() => {
    if (!window.electronApi) return;
    (async () => {
      try {
        const t = await window.electronApi.getThresholds();
        if (t) setThresholds(t);
      } catch (e) {
        // ignore
      }
    })();
  }, [setThresholds]);

  // ⭐ 订阅主进程每 5 秒推送的设备列表更新（USB 拔掉/插入时 devices 数组会立刻变，触发自动停止等逻辑）
  useEffect(() => {
    if (!window.electronApi) return;
    const unsub = window.electronApi.onDevicesUpdated((latestDevices: DeviceInfo[]) => {
      // 用 getState 直接写 store，不触发本组件多余重渲染
      useAppStore.getState().setDevices(latestDevices);
    });
    return () => { try { unsub?.(); } catch (_) { /* ignore */ } };
  }, []);

  // 全局错误处理
  useEffect(() => {
    if (!window.electronApi) return;
    const unsub = window.electronApi.onError((err: any) => {
      message.error?.(err.message || '发生错误');
    });
    return unsub;
  }, []);

  const onDeviceSelected = (device: DeviceInfo) => {
    // 设备选择后的回调（store中已处理，这里可追加逻辑）
  };

  const { message } = AntApp.useApp?.();

  // 根据Tab渲染内容
  const renderContent = () => {
    switch (activeTab) {
      case 'start-test':
        return <StartTestPage selectedDevice={selectedDevice} onBack={() => setActiveTab('dashboard')} />;
      case 'history':
        return <HistoryPage onBack={() => setActiveTab('dashboard')} />;
      case 'dashboard':
      default:
        return <DashboardContent selectedDevice={selectedDevice} />;
    }
  };

  // 头部标签项
  const tabItems = [
    {
      key: 'dashboard',
      label: (
        <span>
          <DashboardOutlined style={{ marginRight: 4 }} />
          实时监控
        </span>
      )
    },
    {
      key: 'start-test',
      label: (
        <span>
          <RocketOutlined style={{ marginRight: 4, color: selectedDevice ? '' : '#8c8c8c' }} />
          启动测速
          <Tooltip title={selectedDevice ? '' : '请先选择设备'}>
            <span style={{ marginLeft: 4, opacity: selectedDevice ? 1 : 0.5 }}>
              {!selectedDevice && '🔒'}
            </span>
          </Tooltip>
        </span>
      ),
      disabled: !selectedDevice
    },
    {
      key: 'history',
      label: (
        <span>
          <HistoryOutlined style={{ marginRight: 4 }} />
          历史记录
        </span>
      )
    }
  ];

  const userMenu: MenuProps['items'] = [
    { key: 'about', icon: <InfoCircleOutlined />, label: '关于软件', onClick: () => showAbout() },
    { type: 'divider' },
    { key: 'docs', icon: <InfoCircleOutlined />, label: '使用文档', disabled: true },
    { key: 'version', disabled: true, label: '版本 v1.0.0' }
  ];

  const showAbout = () => {
    Modal?.info?.({
      title: '🚀 APP性能大师',
      icon: <InfoCircleOutlined style={{ color: '#1677ff' }} />,
      width: 560,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <p><b>版本：</b>v1.0.0 &nbsp;&nbsp;|&nbsp;&nbsp; <b>Build ID：</b>20260814</p>
          <p><b>官方定位：</b>电脑端 Android APP 全维度性能检测与监控平台</p>
          <p><b>核心能力：</b></p>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>📊 <b>实时监控</b>：CPU / 电量 / 内存 / GPU 毫秒级采集 + 趋势曲线</li>
            <li>🚀 <b>启动测速</b>：APP 冷启动（APK重灌）/ 热启动 自动化测试</li>
            <li>⚠️ <b>智能告警</b>：6大类指标自定义阈值，超限实时红色高亮</li>
            <li>📑 <b>报告导出</b>：PDF / PPT / Excel 三格式，绿黄红三色分级</li>
            <li>📚 <b>历史回溯</b>：本地自动留存测试记录，支持筛选 & 详情查看</li>
          </ul>
          <p style={{ marginTop: 14, color: '#8c8c8c', fontSize: 12 }}>
            ✅ 支持 <b>USB 有线</b> 与 <b>无线 ADB（Wi-Fi）</b> 两种连接方式<br/>
            📋 使用前请确认：电脑已配置 ADB 环境 & 安卓手机已开启「USB 调试模式」
          </p>
        </div>
      ),
      okText: '知道了'
    });
  };

  return (
    <div className={`app-container ${activeTab === 'dashboard' ? 'has-metrics' : ''}`}>
      {/* 顶部导航栏 */}
      <div
        style={{
          height: 48, minHeight: 48, background: '#fff', borderBottom: '1px solid #e8e8e8',
          display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between',
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #1677ff, #722ed1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: 0.5,
              boxShadow: '0 2px 6px rgba(22,119,255,0.3)'
            }}
          >
            AP
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              APP性能大师
            </span>
            <span style={{ fontSize: 10, color: '#71717a', letterSpacing: 0.3 }}>
              Mobile App Performance Master · 专业级APP性能检测平台
            </span>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as TabKey)}
            items={tabItems}
            size="small"
            style={{ margin: 0, marginLeft: 24 }}
            tabBarStyle={{ margin: 0, minHeight: 36 }}
          />
        </div>

        <Space size={12}>
          {/* 连接状态指示 */}
          <Space
            size={6}
            style={{
              padding: '4px 12px', borderRadius: 16,
              background: selectedDevice ? '#f6ffed' : '#fafafa',
              border: `1px solid ${selectedDevice ? '#b7eb8f' : '#d9d9d9'}`
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: selectedDevice ? '#52c41a' : '#bfbfbf',
                boxShadow: selectedDevice ? '0 0 6px #52c41a80' : 'none'
              }}
            />
            <span style={{ fontSize: 12, color: selectedDevice ? '#389e0d' : '#8c8c8c' }}>
              {selectedDevice
                ? `${devices.filter(d => d.status === 'connected').length}台设备在线`
                : '无设备连接'}
            </span>
            <CloudSyncOutlined
              style={{
                fontSize: 12,
                color: selectedDevice ? '#52c41a' : '#bfbfbf',
                animation: selectedDevice ? 'pulse 2s infinite' : 'none'
              }}
            />
          </Space>

          {/* 选中APP提示 */}
          {selectedDevice && selectedPackageName && activeTab === 'dashboard' && (
            <span
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 16,
                background: '#e6f4ff', color: '#0958d9', border: '1px solid #91caff'
              }}
            >
              🎯 已选目标APP
            </span>
          )}

          {/* 告警按钮 */}
          <Tooltip title="告警中心">
            <Badge count={alerts.length} offset={[-2, 2]} size="small">
              <Button
                type="text"
                shape="circle"
                icon={<BellOutlined style={{ fontSize: 16 }} />}
                onClick={() => setAlertsOpen(true)}
                style={alerts.length > 0 ? { color: '#ff4d4f' } : {}}
              />
            </Badge>
          </Tooltip>

          {/* 用户菜单 */}
          <Dropdown menu={{ items: userMenu }} trigger={['click']}>
            <Avatar
              size={30}
              style={{
                background: 'linear-gradient(135deg, #1677ff, #722ed1)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600
              }}
              icon={<SettingOutlined />}
            />
          </Dropdown>
        </Space>
      </div>

      {/* 主内容 */}
      <div className="app-main">
        {/* 左侧设备面板 */}
        {activeTab === 'dashboard' && (
          <DevicePanel onDeviceSelected={onDeviceSelected} />
        )}
        {activeTab === 'start-test' && (
          <DevicePanel onDeviceSelected={onDeviceSelected} />
        )}

        {/* 内容区（各页面） */}
        {renderContent()}
      </div>

      {/* 底部指标栏 - 只在dashboard显示 */}
      {activeTab === 'dashboard' && (
        <MetricsBar deviceSelected={!!selectedDevice} />
      )}

      {/* 告警侧栏 */}
      <AlertsPanel open={alertsOpen} onClose={() => setAlertsOpen(false)} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

export default App;
