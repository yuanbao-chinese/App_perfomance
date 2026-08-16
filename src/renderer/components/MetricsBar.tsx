import React, { useState, useEffect } from 'react';
import { Switch, Tooltip, Popover, Modal, Form, InputNumber, Button, message, Badge } from 'antd';
import { SettingOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useAppStore, getStatusColor } from '../store/appStore';
import type { MonitorSwitches, ThresholdConfig } from '../../shared/types';
import { DEFAULT_THRESHOLDS } from '../../shared/types';

interface MetricDef {
  key: keyof MonitorSwitches | 'start';
  title: string;
  iconClass: string;
  iconText: string;
}

const METRICS: MetricDef[] = [
  { key: 'cpu', title: 'CPU监控', iconClass: 'cpu', iconText: 'CPU' },
  { key: 'battery', title: '电量监控', iconClass: 'battery', iconText: '⚡' },
  { key: 'memory', title: '内存监控', iconClass: 'memory', iconText: 'MEM' },
  { key: 'gpu', title: 'GPU监控', iconClass: 'gpu', iconText: 'GPU' },
  { key: 'start', title: '启动测速', iconClass: 'start', iconText: '🚀' }
];

interface Props {
  deviceSelected: boolean;
}

const MetricsBar: React.FC<Props> = ({ deviceSelected }) => {
  const {
    monitorSwitches,
    toggleMetric,
    thresholds,
    setThresholds,
    cpuHistory,
    batteryHistory,
    memoryHistory,
    gpuHistory,
    selectedDeviceId,
    setFullscreenMetric,
    currentView,
    setCurrentView
  } = useAppStore();

  const [configVisible, setConfigVisible] = useState(false);
  const [configMetric, setConfigMetric] = useState<string | null>(null);
  const [configForm] = Form.useForm();

  // 实时获取最新值
  const getLatestValue = (key: keyof MonitorSwitches): { value: string; status: 'normal' | 'warning' | 'critical' } => {
    switch (key) {
      case 'cpu': {
        const last = cpuHistory[cpuHistory.length - 1];
        if (!last) return { value: '--', status: 'normal' };
        const s = getStatusColor(last.appCpuUsage, thresholds.cpu.appCpuUsage);
        return { value: `${last.appCpuUsage.toFixed(0)}%`, status: s };
      }
      case 'battery': {
        const last = batteryHistory[batteryHistory.length - 1];
        if (!last) return { value: '--', status: 'normal' };
        const s = getStatusColor(last.powerConsumptionPerMin, thresholds.battery.normalPowerPerMin);
        return { value: `${last.currentLevel}%`, status: s };
      }
      case 'memory': {
        const last = memoryHistory[memoryHistory.length - 1];
        if (!last) return { value: '--', status: 'normal' };
        const s = getStatusColor(last.physicalMemory, thresholds.memory.peakPhysicalMemory);
        return { value: `${last.physicalMemory}MB`, status: s };
      }
      case 'gpu': {
        const last = gpuHistory[gpuHistory.length - 1];
        if (!last) return { value: '--', status: 'normal' };
        const s = getStatusColor(last.fps, thresholds.gpu.minFps, false);
        return { value: `${last.fps} FPS`, status: s };
      }
      default:
        return { value: '--', status: 'normal' };
    }
  };

  const openConfig = (metricKey: string) => {
    setConfigMetric(metricKey);
    // 设置表单默认值
    const defaults: Record<string, any> = {};
    switch (metricKey) {
      case 'cpu':
        defaults.appCpuUsage = thresholds.cpu.appCpuUsage;
        defaults.systemCpuUsage = thresholds.cpu.systemCpuUsage;
        defaults.backgroundCpuUsage = thresholds.cpu.backgroundCpuUsage;
        break;
      case 'battery':
        defaults.normalPowerPerMin = thresholds.battery.normalPowerPerMin;
        defaults.highLoadPowerPerMin = thresholds.battery.highLoadPowerPerMin;
        defaults.invalidPowerRatio = thresholds.battery.invalidPowerRatio;
        break;
      case 'memory':
        defaults.peakPhysicalMemory = thresholds.memory.peakPhysicalMemory;
        defaults.backgroundMemory = thresholds.memory.backgroundMemory;
        defaults.startupMemoryIncrement = thresholds.memory.startupMemoryIncrement;
        break;
      case 'gpu':
        defaults.gpuUsage = thresholds.gpu.gpuUsage;
        defaults.minFps = thresholds.gpu.minFps;
        defaults.fpsFluctuation = thresholds.gpu.fpsFluctuation;
        defaults.jankCountPerSecond = thresholds.gpu.jankCountPerSecond;
        break;
      case 'start':
        defaults.coldTotalTime = thresholds.coldStart.totalTime;
        defaults.coldFirstFrame = thresholds.coldStart.firstFrameTime;
        defaults.coldTraffic = thresholds.coldStart.trafficConsumption;
        defaults.hotTotalTime = thresholds.hotStart.totalTime;
        defaults.hotFirstScreen = thresholds.hotStart.firstScreenTime;
        break;
    }
    configForm.setFieldsValue(defaults);
    setConfigVisible(true);
  };

  const saveConfig = async () => {
    if (!window.electronApi) {
      // 模拟保存
      const values = configForm.getFieldsValue();
      const patch: Partial<ThresholdConfig> = {};
      switch (configMetric) {
        case 'cpu':
          patch.cpu = { ...DEFAULT_THRESHOLDS.cpu, ...values };
          break;
        case 'battery':
          patch.battery = { ...DEFAULT_THRESHOLDS.battery, ...values };
          break;
        case 'memory':
          patch.memory = { ...DEFAULT_THRESHOLDS.memory, ...values };
          break;
        case 'gpu':
          patch.gpu = { ...DEFAULT_THRESHOLDS.gpu, ...values };
          break;
        case 'start':
          patch.coldStart = {
            totalTime: values.coldTotalTime,
            firstFrameTime: values.coldFirstFrame,
            trafficConsumption: values.coldTraffic
          };
          patch.hotStart = {
            totalTime: values.hotTotalTime,
            firstScreenTime: values.hotFirstScreen
          };
          break;
      }
      const newThresholds = {
        ...thresholds,
        ...patch,
        cpu: { ...thresholds.cpu, ...patch.cpu },
        battery: { ...thresholds.battery, ...patch.battery },
        memory: { ...thresholds.memory, ...patch.memory },
        gpu: { ...thresholds.gpu, ...patch.gpu },
        coldStart: { ...thresholds.coldStart, ...patch.coldStart },
        hotStart: { ...thresholds.hotStart, ...patch.hotStart }
      };
      setThresholds(newThresholds);
      message.success('阈值配置已更新');
      setConfigVisible(false);
      return;
    }
    try {
      const values = configForm.getFieldsValue();
      const patch: Partial<ThresholdConfig> = {};
      switch (configMetric) {
        case 'cpu':
          patch.cpu = values;
          break;
        case 'battery':
          patch.battery = values;
          break;
        case 'memory':
          patch.memory = values;
          break;
        case 'gpu':
          patch.gpu = values;
          break;
        case 'start':
          patch.coldStart = {
            totalTime: values.coldTotalTime,
            firstFrameTime: values.coldFirstFrame,
            trafficConsumption: values.coldTraffic
          };
          patch.hotStart = {
            totalTime: values.hotTotalTime,
            firstScreenTime: values.hotFirstScreen
          };
          break;
      }
      const newT = await window.electronApi.updateThresholds(patch);
      setThresholds(newT);
      message.success('阈值配置已更新');
      setConfigVisible(false);
    } catch (error: any) {
      message.error('保存失败: ' + error.message);
    }
  };

  const handleCardClick = (metric: MetricDef) => {
    if (metric.key === 'start') {
      // 切换到冷启动测试页面
      if (currentView !== 'coldStart' && currentView !== 'hotStart') {
        setCurrentView('coldStart');
      }
    }
  };

  const settingsBtn = (key: string, title: string) => (
    <Popover content={<span>配置{title}阈值</span>}>
      <Button
        type="text"
        size="small"
        icon={<SettingOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          openConfig(key);
        }}
        style={{ padding: '0 4px' }}
      />
    </Popover>
  );

  const renderConfigForm = () => {
    switch (configMetric) {
      case 'cpu':
        return (
          <Form form={configForm} layout="vertical">
            <Form.Item label="APP瞬时CPU占用率阈值 (%)" name="appCpuUsage" rules={[{ required: true, message: '请输入阈值' }]}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="整机CPU占用率阈值 (%)" name="systemCpuUsage" rules={[{ required: true }]}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="后台静置CPU消耗阈值 (%)" name="backgroundCpuUsage" rules={[{ required: true }]}>
              <InputNumber min={0} max={50} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        );
      case 'battery':
        return (
          <Form form={configForm} layout="vertical">
            <Form.Item label="常规场景每分钟耗电阈值 (%)" name="normalPowerPerMin" rules={[{ required: true }]}>
              <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="高负载场景每分钟耗电阈值 (%)" name="highLoadPowerPerMin" rules={[{ required: true }]}>
              <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="无效耗电占比阈值 (%)" name="invalidPowerRatio" rules={[{ required: true }]}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        );
      case 'memory':
        return (
          <Form form={configForm} layout="vertical">
            <Form.Item label="峰值物理内存占用阈值 (MB)" name="peakPhysicalMemory" rules={[{ required: true }]}>
              <InputNumber min={64} max={16384} step={32} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="后台留存内存阈值 (MB)" name="backgroundMemory" rules={[{ required: true }]}>
              <InputNumber min={16} max={8192} step={16} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="单次启动内存增量阈值 (MB)" name="startupMemoryIncrement" rules={[{ required: true }]}>
              <InputNumber min={10} max={2048} step={10} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        );
      case 'gpu':
        return (
          <Form form={configForm} layout="vertical">
            <Form.Item label="GPU占用率阈值 (%)" name="gpuUsage" rules={[{ required: true }]}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="最低帧率阈值 (FPS)" name="minFps" rules={[{ required: true }]}>
              <InputNumber min={1} max={144} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="帧率波动阈值 (FPS)" name="fpsFluctuation" rules={[{ required: true }]}>
              <InputNumber min={0} max={60} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="单秒卡顿次数阈值" name="jankCountPerSecond" rules={[{ required: true }]}>
              <InputNumber min={0} max={60} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        );
      case 'start':
        return (
          <Form form={configForm} layout="vertical">
            <h4 style={{ color: '#1677ff', marginBottom: 8 }}>冷启动阈值</h4>
            <Form.Item label="冷启动总耗时阈值 (ms)" name="coldTotalTime" rules={[{ required: true }]}>
              <InputNumber min={100} max={20000} step={50} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="首帧渲染耗时阈值 (ms)" name="coldFirstFrame" rules={[{ required: true }]}>
              <InputNumber min={50} max={10000} step={20} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="启动流量消耗阈值 (MB)" name="coldTraffic" rules={[{ required: true }]}>
              <InputNumber min={0} max={1024} step={1} style={{ width: '100%' }} />
            </Form.Item>
            <h4 style={{ color: '#1677ff', marginTop: 16, marginBottom: 8 }}>热启动阈值</h4>
            <Form.Item label="热启动总耗时阈值 (ms)" name="hotTotalTime" rules={[{ required: true }]}>
              <InputNumber min={50} max={10000} step={20} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="首屏加载耗时阈值 (ms)" name="hotFirstScreen" rules={[{ required: true }]}>
              <InputNumber min={30} max={5000} step={10} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className={`metrics-bar ${!deviceSelected ? 'disabled' : ''}`}>
        {METRICS.map((metric) => {
          const isStart = metric.key === 'start';
          const isActive = isStart ? false : monitorSwitches[metric.key as keyof MonitorSwitches];
          const valData = !isStart ? getLatestValue(metric.key as keyof MonitorSwitches) : null;
          const valueClass = valData
            ? valData.status === 'critical'
              ? 'error'
              : valData.status === 'warning'
              ? 'warn'
              : ''
            : '';

          return (
            <div
              key={metric.key}
              className={`metric-card ${isActive ? 'active' : ''}`}
              onClick={() => handleCardClick(metric)}
            >
              <div className={`metric-icon ${metric.iconClass}`}>{metric.iconText}</div>
              <div className="metric-info">
                <div className="metric-title">
                  {metric.title}
                  {!isStart && (
                    <Switch
                      size="small"
                      checked={isActive}
                      onChange={(checked, e) => {
                        e?.stopPropagation();
                        toggleMetric(metric.key as keyof MonitorSwitches);
                      }}
                      style={{ marginLeft: 4 }}
                      disabled={!deviceSelected}
                    />
                  )}
                  {settingsBtn(metric.key, metric.title)}
                  {!isStart && !isStart && (
                    <Tooltip title={`全屏查看${metric.title}详情`}>
                      <Button
                        type="text"
                        size="small"
                        icon={<FullscreenOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenMetric(metric.key as any);
                        }}
                        style={{ padding: '0 4px', marginLeft: 2 }}
                      />
                    </Tooltip>
                  )}
                </div>
                <div className={`metric-value ${valueClass}`}>
                  {valData ? valData.value : (isStart ? '点击测试' : '--')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        title={`配置 ${configMetric ? METRICS.find(m => m.key === configMetric)?.title : ''} 阈值`}
        open={configVisible}
        onCancel={() => setConfigVisible(false)}
        onOk={saveConfig}
        okText="保存配置"
        width={500}
      >
        {renderConfigForm()}
        <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 6, fontSize: 12, color: '#8c8c8c' }}>
          <strong style={{ color: '#595959' }}>💡 行业默认参考值：</strong>
          <br />
          超出设定阈值的数据将在界面中红色高亮告警，并计入测试报告。
        </div>
      </Modal>
    </>
  );
};

export default MetricsBar;
