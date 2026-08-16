import React, { useEffect, useState } from 'react';
import { Button, Tooltip, Empty, Spin, message, Alert } from 'antd';
import { ReloadOutlined, MobileOutlined, ThunderboltOutlined, WarningOutlined, CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAppStore } from '../store/appStore';
import type { DeviceInfo } from '../../shared/types';

interface Props {
  onDeviceSelected: (device: DeviceInfo) => void;
}

type AdbDiagnostics = {
  adbFound: boolean;
  adbPath: string;
  version?: string;
  installHint: string;
  deviceCheckHint: string;
};

const DevicePanel: React.FC<Props> = ({ onDeviceSelected }) => {
  const {
    devices,
    selectedDeviceId,
    isScanningDevices,
    setScanning,
    setDevices,
    selectDevice
  } = useAppStore();

  // ADB 环境诊断结果（设备为空时展示给用户具体操作步骤）
  const [adbDiag, setAdbDiag] = useState<AdbDiagnostics | null>(null);

  // 初始扫描设备
  useEffect(() => {
    scanDevices();
    // 订阅设备更新
    if (window.electronApi) {
      const unsub = window.electronApi.onDevicesUpdated((devs: DeviceInfo[]) => {
        setDevices(devs);
      });
      return unsub;
    }
  }, []);

  const scanDevices = async () => {
    if (!window.electronApi) {
      // 模拟数据用于演示
      setScanning(true);
      setTimeout(() => {
        const mockDevices: DeviceInfo[] = [
          {
            id: 'emulator-5554',
            model: 'Pixel 6 Pro',
            brand: 'Google',
            systemVersion: 'Android 13 (API 33)',
            status: 'connected',
            serialNumber: 'emulator-5554',
            cpuInfo: 'arm64-v8a',
            memoryTotal: 8192,
            batteryLevel: 78
          },
          {
            id: '127.0.0.1:5555',
            model: '小米 13 Ultra',
            brand: 'Xiaomi',
            systemVersion: 'Android 14 (API 34)',
            status: 'connected',
            serialNumber: '127.0.0.1:5555',
            cpuInfo: 'arm64-v8a',
            memoryTotal: 16384,
            batteryLevel: 62
          },
          {
            id: 'device-9876',
            model: '华为 Mate 60 Pro',
            brand: 'HUAWEI',
            systemVersion: 'Android 12 (API 31)',
            status: 'connected',
            serialNumber: 'device-9876',
            cpuInfo: 'arm64-v8a',
            memoryTotal: 12288,
            batteryLevel: 45
          }
        ];
        setDevices(mockDevices);
        setScanning(false);
      }, 1500);
      return;
    }

    try {
      setScanning(true);
      const devs = await window.electronApi.scanDevices();
      setDevices(devs);
      if (devs.length === 0) {
        message.info('未检测到已连接的手机设备，请按下方步骤检查');
        // 拉取adb诊断，给用户展示具体可操作建议
        try {
          const diag = await window.electronApi.getAdbDiagnostics();
          setAdbDiag(diag);
        } catch (_) { /* 忽略诊断接口失败 */ }
      } else {
        message.success(`已检测到 ${devs.length} 台设备`);
        setAdbDiag(null); // 扫到了就清掉诊断提示
      }
    } catch (error: any) {
      message.error('扫描设备失败: ' + (error.message || '未知错误'));
      try {
        const diag = await window.electronApi.getAdbDiagnostics();
        setAdbDiag(diag);
      } catch (_) {}
    } finally {
      setScanning(false);
    }
  };

  const handleSelectDevice = (device: DeviceInfo) => {
    selectDevice(device.id);
    onDeviceSelected(device);
    message.success(`已选择设备: ${device.model}`);
  };

  const handleDisconnect = async (e: React.MouseEvent, device: DeviceInfo) => {
    e.stopPropagation();
    if (!window.electronApi) return;
    try {
      await window.electronApi.disconnectDevice(device.id);
      message.info(`已断开设备: ${device.model}`);
    } catch (error: any) {
      message.error('断开失败: ' + error.message);
    }
  };

  return (
    <div className="device-panel">
      <div className="device-panel-header">
        <h2>
          <MobileOutlined style={{ marginRight: 6 }} />
          设备列表
        </h2>
        <p>共 {devices.length} 台已连接设备</p>
      </div>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <Button
          type="primary"
          block
          icon={isScanningDevices ? <Spin size="small" /> : <ReloadOutlined />}
          onClick={scanDevices}
          disabled={isScanningDevices}
        >
          {isScanningDevices ? '扫描中...' : '刷新设备列表'}
        </Button>
      </div>

      <div className="device-list">
        {isScanningDevices && devices.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spin size="large" />
            <p style={{ marginTop: 16, color: '#8c8c8c', fontSize: 13 }}>正在扫描设备...</p>
          </div>
        ) : devices.length === 0 ? (
          <div style={{ padding: '16px 12px 24px' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div style={{ fontSize: 12 }}>
                  暂无连接设备
                  <p style={{ color: '#8c8c8c', marginTop: 8, marginBottom: 0 }}>
                    请完成手机端 & Mac 端设置后，点击【刷新设备列表】
                  </p>
                </div>
              }
              style={{ marginTop: 20 }}
            />

            {/* ============ ADB 环境详细诊断卡（设备为空时自动展示） ============ */}
            {adbDiag && (
              <div style={{ marginTop: 12, textAlign: 'left' }}>
                {/* ADB 安装状态 */}
                <Alert
                  type={adbDiag.adbFound ? 'success' : 'error'}
                  showIcon
                  icon={adbDiag.adbFound ? <CheckCircleOutlined /> : <WarningOutlined />}
                  style={{ marginBottom: 12 }}
                  message={
                    <span style={{ fontWeight: 600 }}>
                      {adbDiag.adbFound ? '✅ ADB 驱动已就绪' : '❌ 未检测到 ADB 命令'}
                      <span style={{ color: '#8c8c8c', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                        路径: <code style={{ background: '#fafafa', padding: '1px 4px', borderRadius: 3 }}>{adbDiag.adbPath}</code>
                      </span>
                    </span>
                  }
                />

                {/* ADB 安装建议（未找到才展示红卡） */}
                {!adbDiag.adbFound && (
                  <div
                    style={{
                      background: '#fff1f0',
                      border: '1px solid #ffa39e',
                      borderRadius: 6,
                      padding: '12px 14px',
                      marginBottom: 12,
                      fontSize: 12,
                      lineHeight: 1.9,
                      color: '#1f1f1f',
                      whiteSpace: 'pre-wrap',
                      fontFamily: '-apple-system, Menlo, Consolas, monospace'
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#cf1322', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <InfoCircleOutlined /> 安装 ADB 工具（Mac）
                    </div>
                    {adbDiag.installHint.split('\n').map((line, i) => (
                      <div key={i} style={{ paddingLeft: line.startsWith('   ') ? 16 : 0 }}>{line || ' '}</div>
                    ))}
                  </div>
                )}

                {/* 手机端 + Mac 端连接步骤（黄卡，总是展示） */}
                <div
                  style={{
                    background: '#fffbe6',
                    border: '1px solid #ffe58f',
                    borderRadius: 6,
                    padding: '12px 14px',
                    fontSize: 12,
                    lineHeight: 1.9,
                    color: '#1f1f1f',
                    whiteSpace: 'pre-wrap',
                    fontFamily: '-apple-system, Menlo, Consolas, monospace'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#d46b08', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ThunderboltOutlined /> 手机 + Mac 连接检查清单（必做）
                  </div>
                  {adbDiag.deviceCheckHint.split('\n').map((line, i) => (
                    <div key={i} style={{ paddingLeft: line.startsWith('  ') ? 16 : 0 }}>{line || ' '}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          devices.map((device) => (
            <div
              key={device.id}
              className={`device-item ${selectedDeviceId === device.id ? 'selected' : ''}`}
              onClick={() => handleSelectDevice(device)}
            >
              <div className="device-name">
                <span
                  className={`device-status ${device.status === 'disconnected' ? 'disconnected' : ''}`}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {device.model}
                </span>
                {selectedDeviceId === device.id && (
                  <ThunderboltOutlined style={{ color: '#1677ff' }} />
                )}
              </div>
              <div className="device-info">
                <div>
                  系统: {device.systemVersion}
                  {device.brand && <span style={{ marginLeft: 6 }}>| {device.brand}</span>}
                </div>
                <div>
                  ID: <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{device.serialNumber.slice(0, 14)}...</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    电量: <span style={{ color: device.batteryLevel !== undefined && device.batteryLevel < 20 ? '#ff4d4f' : '#52c41a' }}>
                      {device.batteryLevel !== undefined ? device.batteryLevel + '%' : '-'}
                    </span>
                  </span>
                  {device.memoryTotal && <span>{Math.round(device.memoryTotal / 1024)}GB</span>}
                </div>
                <div style={{ marginTop: 6, textAlign: 'right' }}>
                  <Tooltip title="断开连接">
                    <Button
                      type="text"
                      size="small"
                      danger
                      onClick={(e) => handleDisconnect(e, device)}
                      style={{ padding: '0 4px', fontSize: 11, height: 20 }}
                    >
                      断开
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DevicePanel;
