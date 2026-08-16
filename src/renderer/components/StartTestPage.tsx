import React, { useState } from 'react';
import {
  Card, Button, Upload, Form, InputNumber, Tabs, Row, Col, Statistic, Divider,
  Progress, Alert, message, Space, Tag, Result, Spin, Steps
} from 'antd';
import {
  UploadOutlined, RocketOutlined, ThunderboltOutlined,
  FileZipOutlined, DashboardOutlined, ReloadOutlined, AppstoreOutlined
} from '@ant-design/icons';
import { useAppStore, getStatusColor, STATUS_COLORS } from '../store/appStore';
import type { DeviceInfo, ColdStartData, HotStartData } from '../../shared/types';

interface Props {
  selectedDevice: DeviceInfo | null;
  onBack: () => void;
}

const StartTestPage: React.FC<Props> = ({ selectedDevice, onBack }) => {
  const {
    installedApps,
    selectedPackageName,
    selectApp,
    setInstalledApps,
    isLoadingApps,
    setLoadingApps,
    uploadedApkPath,
    setUploadedApk,
    coldTrafficConfig,
    setColdTrafficConfig,
    setRunningColdTest,
    setRunningHotTest,
    coldStartResult,
    setColdStartResult,
    hotStartResult,
    setHotStartResult,
    thresholds
  } = useAppStore();

  const [coldForm] = Form.useForm();
  const [hotForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('cold');
  const [coldStep, setColdStep] = useState(0);
  const [hotStep, setHotStep] = useState(0);

  const selectedApp = installedApps.find((a) => a.packageName === selectedPackageName);

  /** 刷新APP列表（与DashboardContent相同逻辑） */
  const loadInstalledApps = async () => {
    if (!selectedDevice) {
      message.warning('请先在左侧选择设备');
      return;
    }
    if (!window.electronApi) {
      // 模拟
      setLoadingApps(true);
      setTimeout(() => {
        setInstalledApps([
          { packageName: 'com.tencent.mm', appName: '微信', versionName: '8.0.44', versionCode: 2720, targetSdkVersion: 33 },
          { packageName: 'com.eg.android.AlipayGphone', appName: '支付宝', versionName: '10.5.20', versionCode: 1000, targetSdkVersion: 33 },
          { packageName: 'com.ss.android.ugc.aweme', appName: '抖音', versionName: '27.8.0', versionCode: 2780, targetSdkVersion: 34 },
          { packageName: 'tv.danmaku.bili', appName: '哔哩哔哩', versionName: '7.30.0', versionCode: 7300, targetSdkVersion: 33 },
          { packageName: 'com.tencent.tmgp.sgame', appName: '王者荣耀', versionName: '3.86.1', versionCode: 3861, targetSdkVersion: 33 },
          { packageName: 'com.jingdong.app.mall', appName: '京东', versionName: '12.3.0', versionCode: 12300, targetSdkVersion: 33 }
        ]);
        setLoadingApps(false);
      }, 1200);
      return;
    }
    try {
      setLoadingApps(true);
      const apps = await window.electronApi.getInstalledApps(selectedDevice.id);
      setInstalledApps(apps);
      message.success(`已加载 ${apps.length} 个应用`);
    } catch (e: any) {
      message.error('加载应用列表失败: ' + (e?.message || String(e)));
    } finally {
      setLoadingApps(false);
    }
  };

  // ========== 冷启动测试 ==========
  const handleSelectApk = async (file: File) => {
    if (!window.electronApi) {
      // 模拟
      setUploadedApk(`/mock/path/${file.name}`);
      message.success(`已选择 APK: ${file.name}`);
      return false;
    }
    try {
      const path = await window.electronApi.selectApkFile();
      if (path) setUploadedApk(path);
    } catch (error: any) {
      message.error('选择文件失败: ' + error.message);
    }
    return false; // 阻止默认上传
  };

  const runColdTest = async () => {
    if (!selectedDevice) { message.warning('请先选择设备'); return; }
    if (!uploadedApkPath) { message.warning('请先上传APK安装包'); return; }
    if (!selectedPackageName) { message.warning('请选择目标包名'); return; }

    const cfg = coldForm.getFieldsValue();
    const trafficCfg = cfg.initialTraffic || cfg.networkThreshold
      ? { initialTraffic: cfg.initialTraffic || 0, networkThreshold: cfg.networkThreshold || 0 }
      : null;

    setRunningColdTest(true);
    setColdStep(1);
    setColdStartResult(null);

    const run = async (): Promise<ColdStartData> => {
      setColdStep(2);
      await new Promise((r) => setTimeout(r, 1500)); // 卸载
      setColdStep(3);
      await new Promise((r) => setTimeout(r, 3000)); // 安装
      setColdStep(4);
      await new Promise((r) => setTimeout(r, 2500)); // 启动
      await new Promise((r) => setTimeout(r, 1500)); // 采集数据

      // 构造mock结果
      const totalTime = 1200 + Math.floor(Math.random() * 1500);
      const firstFrame = Math.floor(totalTime * (0.35 + Math.random() * 0.15));
      const passed = totalTime <= thresholds.coldStart.totalTime && firstFrame <= thresholds.coldStart.firstFrameTime;
      return {
        testId: 'cold_' + Date.now(),
        timestamp: Date.now(),
        status: passed ? 'success' : 'success',
        installTime: 2800 + Math.floor(Math.random() * 1500),
        totalStartTime: totalTime,
        firstFrameTime: firstFrame,
        peakCpuUsage: +(40 + Math.random() * 50).toFixed(1),
        peakMemoryUsage: 400 + Math.floor(Math.random() * 500),
        peakBatteryUsage: +(Math.random() * 0.8).toFixed(2),
        trafficConsumption: Math.floor(100 + Math.random() * 4000),
        failureRate: 0,
        apkInfo: { name: uploadedApkPath.split('/').pop() || 'app.apk', size: 50 * 1024 * 1024, version: '1.0.0' },
        trafficConfig: trafficCfg ?? undefined
      };
    };

    try {
      let result: ColdStartData;
      if (!window.electronApi) {
        result = await run();
      } else {
        result = (await window.electronApi.startColdTest(
          selectedDevice.id,
          uploadedApkPath,
          selectedPackageName,
          trafficCfg
        ))!;
      }
      setColdStartResult(result);
      setColdStep(5);
      if (result.status === 'success') {
        message.success('冷启动测试完成！');
      } else {
        message.error('冷启动测试失败: ' + (result.errorMessage || '未知错误'));
      }
    } catch (e: any) {
      message.error('测试异常: ' + e.message);
    } finally {
      setRunningColdTest(false);
    }
  };

  // ========== 热启动测试 ==========
  const runHotTest = async () => {
    if (!selectedDevice) { message.warning('请先选择设备'); return; }
    if (!selectedPackageName) { message.warning('请选择目标APP'); return; }

    setRunningHotTest(true);
    setHotStep(1);
    setHotStartResult(null);

    try {
      let result: HotStartData;
      if (!window.electronApi) {
        setHotStep(2);
        await new Promise((r) => setTimeout(r, 1500));
        setHotStep(3);
        await new Promise((r) => setTimeout(r, 1500));
        const totalTime = 300 + Math.floor(Math.random() * 800);
        const firstScreen = Math.floor(totalTime * (0.3 + Math.random() * 0.3));
        result = {
          testId: 'hot_' + Date.now(),
          timestamp: Date.now(),
          status: 'success',
          totalStartTime: totalTime,
          backgroundWakeTime: Math.floor(totalTime * (0.2 + Math.random() * 0.2)),
          firstScreenTime: firstScreen,
          resourceFluctuation: {
            cpuDelta: +(5 + Math.random() * 25).toFixed(1),
            memoryDelta: 20 + Math.floor(Math.random() * 120),
            batteryDelta: +(Math.random() * 0.3).toFixed(2)
          }
        };
      } else {
        result = (await window.electronApi.startHotTest(
          selectedDevice.id,
          selectedPackageName
        ))!;
      }
      setHotStartResult(result);
      setHotStep(4);
      if (result.status === 'success') {
        message.success('热启动测试完成！');
      } else {
        message.error('热启动测试失败: ' + (result.errorMessage || '未知错误'));
      }
    } catch (e: any) {
      message.error('测试异常: ' + e.message);
    } finally {
      setRunningHotTest(false);
    }
  };

  const formatBytes = (kb: number) => {
    if (kb < 1024) return `${kb} KB`;
    const mb = (kb / 1024).toFixed(2);
    if (parseFloat(mb) < 1024) return `${mb} MB`;
    return `${(parseFloat(mb) / 1024).toFixed(2)} GB`;
  };

  const renderColdResult = () => {
    if (!coldStartResult) return null;
    const t = thresholds.coldStart;
    const totalStatus = getStatusColor(coldStartResult.totalStartTime, t.totalTime);
    const frameStatus = getStatusColor(coldStartResult.firstFrameTime, t.firstFrameTime);
    const trafficStatus = getStatusColor(coldStartResult.trafficConsumption / 1024, t.trafficConsumption);

    return (
      <Result
        status={coldStartResult.status === 'success' ? 'success' : 'error'}
        title={coldStartResult.status === 'success' ? '冷启动测试成功' : '冷启动测试失败'}
        subTitle={coldStartResult.errorMessage || `测试ID: ${coldStartResult.testId}`}
      >
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Row gutter={[24, 16]} style={{ marginTop: 8 }}>
            <Col span={8}>
              <Card style={{ textAlign: 'center' }}>
                <Statistic
                  title="安装耗时"
                  value={coldStartResult.installTime}
                  suffix="ms"
                  precision={0}
                  valueStyle={{ color: '#722ed1' }}
                />
                <Progress
                  percent={Math.min(100, Math.round((coldStartResult.installTime / 8000) * 100))}
                  showInfo={false}
                  strokeColor="#722ed1"
                  style={{ marginTop: 8 }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card style={{ textAlign: 'center', borderTop: `3px solid ${STATUS_COLORS[totalStatus]}` }}>
                <Statistic
                  title={
                    <span>
                      冷启动总耗时
                      <Tag color={totalStatus === 'normal' ? 'green' : totalStatus === 'warning' ? 'gold' : 'red'} style={{ marginLeft: 6 }}>
                        {totalStatus === 'normal' ? '达标' : '超限'}
                      </Tag>
                    </span>
                  }
                  value={coldStartResult.totalStartTime}
                  suffix="ms"
                  valueStyle={{ color: STATUS_COLORS[totalStatus] }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                  阈值: {t.totalTime}ms
                  <Progress
                    percent={Math.min(100, Math.round((coldStartResult.totalStartTime / t.totalTime) * 100))}
                    showInfo={false}
                    strokeColor={STATUS_COLORS[totalStatus]}
                    style={{ marginTop: 6 }}
                  />
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card style={{ textAlign: 'center', borderTop: `3px solid ${STATUS_COLORS[frameStatus]}` }}>
                <Statistic
                  title={
                    <span>
                      首帧渲染耗时
                      <Tag color={frameStatus === 'normal' ? 'green' : frameStatus === 'warning' ? 'gold' : 'red'} style={{ marginLeft: 6 }}>
                        {frameStatus === 'normal' ? '达标' : '超限'}
                      </Tag>
                    </span>
                  }
                  value={coldStartResult.firstFrameTime}
                  suffix="ms"
                  valueStyle={{ color: STATUS_COLORS[frameStatus] }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                  阈值: {t.firstFrameTime}ms
                  <Progress
                    percent={Math.min(100, Math.round((coldStartResult.firstFrameTime / t.firstFrameTime) * 100))}
                    showInfo={false}
                    strokeColor={STATUS_COLORS[frameStatus]}
                    style={{ marginTop: 6 }}
                  />
                </div>
              </Card>
            </Col>
          </Row>

          <Divider style={{ margin: '24px 0 16px' }} />
          <h4 style={{ color: '#1677ff' }}>📊 启动阶段资源占用</h4>
          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="CPU峰值占用" value={coldStartResult.peakCpuUsage} suffix="%" precision={1} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="内存峰值占用" value={coldStartResult.peakMemoryUsage} suffix="MB" />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="电量消耗" value={coldStartResult.peakBatteryUsage} suffix="%" precision={2} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ borderTop: `3px solid ${STATUS_COLORS[trafficStatus]}` }}>
                <Statistic
                  title={<span>流量消耗 <Tag color={trafficStatus === 'normal' ? 'green' : 'red'}>{trafficStatus === 'normal' ? '达标' : '超限'}</Tag></span>}
                  value={coldStartResult.trafficConsumption}
                  suffix="KB"
                  formatter={(v) => formatBytes(+v)}
                />
                <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>阈值: {t.trafficConsumption}MB</div>
              </Card>
            </Col>
          </Row>

          {coldStartResult.apkInfo && (
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              message="APK信息"
              description={`${coldStartResult.apkInfo.name} · 大小: ${(coldStartResult.apkInfo.size / 1024 / 1024).toFixed(2)}MB · 版本: ${coldStartResult.apkInfo.version}`}
            />
          )}
        </div>
      </Result>
    );
  };

  const renderHotResult = () => {
    if (!hotStartResult) return null;
    const t = thresholds.hotStart;
    const totalStatus = getStatusColor(hotStartResult.totalStartTime, t.totalTime);
    const screenStatus = getStatusColor(hotStartResult.firstScreenTime, t.firstScreenTime);

    return (
      <Result
        status={hotStartResult.status === 'success' ? 'success' : 'error'}
        title={hotStartResult.status === 'success' ? '热启动测试成功' : '热启动测试失败'}
        subTitle={hotStartResult.errorMessage || `测试ID: ${hotStartResult.testId}`}
      >
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Row gutter={[24, 16]}>
            <Col span={8}>
              <Card style={{ textAlign: 'center' }}>
                <Statistic
                  title="后台唤醒耗时"
                  value={hotStartResult.backgroundWakeTime}
                  suffix="ms"
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card style={{ textAlign: 'center', borderTop: `3px solid ${STATUS_COLORS[totalStatus]}` }}>
                <Statistic
                  title={
                    <span>
                      热启动总耗时
                      <Tag color={totalStatus === 'normal' ? 'green' : 'red'} style={{ marginLeft: 6 }}>
                        {totalStatus === 'normal' ? '达标' : '超限'}
                      </Tag>
                    </span>
                  }
                  value={hotStartResult.totalStartTime}
                  suffix="ms"
                  valueStyle={{ color: STATUS_COLORS[totalStatus] }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                  阈值: {t.totalTime}ms
                </div>
                <Progress
                  percent={Math.min(100, Math.round((hotStartResult.totalStartTime / t.totalTime) * 100))}
                  showInfo={false}
                  strokeColor={STATUS_COLORS[totalStatus]}
                  style={{ marginTop: 6 }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card style={{ textAlign: 'center', borderTop: `3px solid ${STATUS_COLORS[screenStatus]}` }}>
                <Statistic
                  title={
                    <span>
                      首屏加载耗时
                      <Tag color={screenStatus === 'normal' ? 'green' : 'red'} style={{ marginLeft: 6 }}>
                        {screenStatus === 'normal' ? '达标' : '超限'}
                      </Tag>
                    </span>
                  }
                  value={hotStartResult.firstScreenTime}
                  suffix="ms"
                  valueStyle={{ color: STATUS_COLORS[screenStatus] }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                  阈值: {t.firstScreenTime}ms
                </div>
              </Card>
            </Col>
          </Row>

          <Divider style={{ margin: '24px 0 16px' }} />
          <h4 style={{ color: '#eb2f96' }}>📈 启动资源消耗波动</h4>
          <Row gutter={16}>
            <Col span={8}>
              <Card size="small">
                <Statistic title="CPU波动" value={hotStartResult.resourceFluctuation.cpuDelta} suffix="%" precision={1} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="内存波动" value={hotStartResult.resourceFluctuation.memoryDelta} suffix="MB" />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="电量消耗" value={hotStartResult.resourceFluctuation.batteryDelta} suffix="%" precision={2} />
              </Card>
            </Col>
          </Row>
        </div>
      </Result>
    );
  };

  if (!selectedDevice) {
    return (
      <div className="content-area">
        <div className="content-header">
          <Button onClick={onBack} icon={<DashboardOutlined />}>返回仪表盘</Button>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🚀</div>
          <h3>请先选择设备</h3>
          <p>启动测速需要先在左侧选择已连接的手机设备</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="content-header">
        <Space>
          <Button onClick={onBack} icon={<DashboardOutlined />}>返回仪表盘</Button>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            <RocketOutlined style={{ color: '#722ed1', marginRight: 6 }} />
            APP 启动测速中心
          </h3>
          <Tag color="blue">{selectedDevice.model}</Tag>
        </Space>
      </div>

      <div className="content-body" style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="large"
          items={[
            {
              key: 'cold',
              label: (
                <span>
                  <RocketOutlined style={{ color: '#722ed1' }} /> 冷启动测试
                  <Tag color="purple" style={{ marginLeft: 8 }}>卸载→安装→首次启动</Tag>
                </span>
              ),
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 20 }}
                    message="冷启动测试说明"
                    description="最严苛的启动测试场景：自动卸载设备原有同名APP → 静默安装APK → 首次启动APP，全程记录安装耗时、启动耗时、首帧渲染时间、启动阶段CPU/内存/电量/流量消耗。"
                  />

                  <Row gutter={24}>
                    <Col xs={24} md={14}>
                      <Card title="📦 测试配置" style={{ marginBottom: 16 }}>
                        {/* APK上传 */}
                        <div style={{ marginBottom: 20 }}>
                          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                            <FileZipOutlined style={{ color: '#fa8c16', marginRight: 4 }} />
                            1. 上传 APK 安装包（必填）
                          </label>
                          <Upload.Dragger
                            accept=".apk"
                            showUploadList={false}
                            beforeUpload={handleSelectApk}
                            multiple={false}
                            disabled={useAppStore.getState().isRunningColdTest}
                          >
                            <p className="ant-upload-drag-icon"><UploadOutlined style={{ color: '#1677ff' }} /></p>
                            <p className="ant-upload-text">点击或拖拽 APK 文件到此区域</p>
                            <p className="ant-upload-hint">支持 .apk 格式的 Android 安装包文件</p>
                          </Upload.Dragger>
                          {uploadedApkPath && (
                            <Alert
                              type="success"
                              showIcon
                              style={{ marginTop: 12 }}
                              message={`已选择: ${uploadedApkPath.split('/').pop() || uploadedApkPath.split('\\\\').pop()}`}
                            />
                          )}
                        </div>

                        {/* 目标APP包名选择 */}
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                              2. 选择目标 APP 包名
                            </label>
                            <Space size={8}>
                              <Tag icon={<AppstoreOutlined />} color="blue" style={{ margin: 0 }}>
                                共 {installedApps.length} 个APP
                              </Tag>
                              <Button
                                size="small"
                                icon={isLoadingApps ? <Spin size="small" /> : <ReloadOutlined />}
                                onClick={loadInstalledApps}
                                disabled={!selectedDevice}
                              >
                                {isLoadingApps ? '加载中' : '刷新'}
                              </Button>
                            </Space>
                          </div>
                          <Form form={coldForm}>
                            <Form.Item
                              name="targetPackage"
                              rules={[{ required: true, message: '请选择目标包名' }]}
                              initialValue={selectedPackageName}
                              style={{ marginBottom: 0 }}
                            >
                              <SelectLike
                                apps={installedApps}
                                value={selectedPackageName}
                                onChange={(v) => {
                                  selectApp(v);
                                  coldForm.setFieldValue('targetPackage', v);
                                }}
                                placeholder="选择/输入APP包名（可搜中文名）"
                                loading={isLoadingApps}
                              />
                            </Form.Item>
                          </Form>
                          {!isLoadingApps && installedApps.length === 0 && (
                            <Alert
                              type="warning"
                              showIcon
                              style={{ marginTop: 8 }}
                              message="还没有加载到应用列表"
                              description="请先在左侧选中手机设备，再点右上角【刷新】按钮拉取"
                            />
                          )}
                        </div>

                        {/* 流量配置（可选） */}
                        <div style={{ marginBottom: 20 }}>
                          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                            3. 流量参数配置 <Tag color="default">可选</Tag>
                          </label>
                          <Form form={coldForm} layout="vertical">
                            <Row gutter={12}>
                              <Col span={12}>
                                <Form.Item label="初始流量数据 (KB)" name="initialTraffic">
                                  <InputNumber min={0} step={100} style={{ width: '100%' }} placeholder="测试前流量" />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item label="网络环境阈值 (MB)" name="networkThreshold">
                                  <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="如：移动/Wi-Fi" />
                                </Form.Item>
                              </Col>
                            </Row>
                          </Form>
                        </div>

                        {/* 测试步骤指示 */}
                        <div style={{ marginTop: 24 }}>
                          <Steps
                            current={coldStep}
                            size="small"
                            items={[
                              { title: '准备就绪' },
                              { title: '卸载原APP' },
                              { title: '安装APK' },
                              { title: '启动并采集数据' },
                              { title: '测试完成' }
                            ]}
                          />
                        </div>

                        <Space style={{ marginTop: 24 }}>
                          <Button
                            type="primary"
                            size="large"
                            icon={<RocketOutlined />}
                            onClick={runColdTest}
                            loading={useAppStore.getState().isRunningColdTest}
                            disabled={!uploadedApkPath || !selectedPackageName}
                          >
                            开始冷启动测试
                          </Button>
                          <Button
                            size="large"
                            onClick={() => { setColdStartResult(null); setColdStep(0); }}
                          >
                            重置结果
                          </Button>
                        </Space>
                      </Card>
                    </Col>

                    <Col xs={24} md={10}>
                      <Card
                        title="🎯 阈值参考"
                        type="inner"
                        style={{ marginBottom: 16 }}
                      >
                        <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 2.2 }}>
                          <li>冷启动总耗时 ≤ <b style={{ color: '#1677ff' }}>{thresholds.coldStart.totalTime}ms</b></li>
                          <li>首帧渲染耗时 ≤ <b style={{ color: '#1677ff' }}>{thresholds.coldStart.firstFrameTime}ms</b></li>
                          <li>流量消耗 ≤ <b style={{ color: '#1677ff' }}>{thresholds.coldStart.trafficConsumption}MB</b></li>
                        </ul>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 12 }}>
                          可在底部指标栏点击「⚙️ 启动测速」图标修改阈值
                        </div>
                      </Card>

                      <Card title="⚠️ 测试注意事项" type="inner">
                        <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 2, fontSize: 13, color: '#595959' }}>
                          <li>确保手机已开启USB调试并授权</li>
                          <li>保持屏幕解锁，测试期间请勿操作</li>
                          <li>推荐清除后台其他APP再执行测试</li>
                          <li>建议同一APP重复测试3次取平均值</li>
                          <li>大体积APK安装时间会比较长</li>
                        </ul>
                      </Card>
                    </Col>
                  </Row>

                  <Divider />
                  {renderColdResult()}
                </div>
              )
            },
            {
              key: 'hot',
              label: (
                <span>
                  <ThunderboltOutlined style={{ color: '#fa8c16' }} /> 热启动测试
                  <Tag color="orange" style={{ marginLeft: 8 }}>清理后台→再次启动</Tag>
                </span>
              ),
              children: (
                <div>
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 20 }}
                    message="热启动测试说明"
                    description="模拟用户日常重复打开APP场景：设备已安装目标APP，强制清理APP后台进程及缓存 → 再次启动APP，记录热启动耗时、后台唤醒、首屏加载时间和资源消耗波动。"
                  />

                  <Row gutter={24}>
                    <Col xs={24} md={14}>
                      <Card title="⚡ 测试配置" style={{ marginBottom: 16 }}>
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                              1. 选择目标 APP（设备已安装）
                            </label>
                            <Space size={8}>
                              <Tag icon={<AppstoreOutlined />} color="blue" style={{ margin: 0 }}>
                                共 {installedApps.length} 个APP
                              </Tag>
                              <Button
                                size="small"
                                icon={isLoadingApps ? <Spin size="small" /> : <ReloadOutlined />}
                                onClick={loadInstalledApps}
                                disabled={!selectedDevice}
                              >
                                {isLoadingApps ? '加载中' : '刷新'}
                              </Button>
                            </Space>
                          </div>
                          <Form form={hotForm}>
                            <Form.Item
                              name="targetPackage"
                              rules={[{ required: true, message: '请选择目标APP' }]}
                              initialValue={selectedPackageName}
                              style={{ marginBottom: 0 }}
                            >
                              <SelectLike
                                apps={installedApps}
                                value={selectedPackageName}
                                onChange={(v) => {
                                  selectApp(v);
                                  hotForm.setFieldValue('targetPackage', v);
                                }}
                                placeholder="从设备已安装APP列表中选择（可搜中文名）"
                                loading={isLoadingApps}
                              />
                            </Form.Item>
                          </Form>
                          {!isLoadingApps && installedApps.length === 0 && (
                            <Alert
                              type="warning"
                              showIcon
                              style={{ marginTop: 8 }}
                              message="还没有加载到应用列表"
                              description="请先在左侧选中手机设备，再点右上角【刷新】按钮拉取"
                            />
                          )}
                          {selectedApp && (
                            <Alert
                              type="success"
                              showIcon
                              style={{ marginTop: 8 }}
                              message={`已选: ${selectedApp.appName} v${selectedApp.versionName || '?'}`}
                              description={`包名: ${selectedApp.packageName}`}
                            />
                          )}
                        </div>

                        <div style={{ marginTop: 24 }}>
                          <Steps
                            current={hotStep}
                            size="small"
                            items={[
                              { title: '准备就绪' },
                              { title: '清理后台进程' },
                              { title: '启动并采集数据' },
                              { title: '测试完成' }
                            ]}
                          />
                        </div>

                        <Space style={{ marginTop: 24 }}>
                          <Button
                            type="primary"
                            size="large"
                            danger
                            icon={<ThunderboltOutlined />}
                            onClick={runHotTest}
                            loading={useAppStore.getState().isRunningHotTest}
                            disabled={!selectedPackageName}
                          >
                            开始热启动测试
                          </Button>
                          <Button
                            size="large"
                            onClick={() => { setHotStartResult(null); setHotStep(0); }}
                          >
                            重置结果
                          </Button>
                        </Space>
                      </Card>
                    </Col>

                    <Col xs={24} md={10}>
                      <Card title="🎯 阈值参考" type="inner" style={{ marginBottom: 16 }}>
                        <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 2.2 }}>
                          <li>热启动总耗时 ≤ <b style={{ color: '#fa8c16' }}>{thresholds.hotStart.totalTime}ms</b></li>
                          <li>首屏加载耗时 ≤ <b style={{ color: '#fa8c16' }}>{thresholds.hotStart.firstScreenTime}ms</b></li>
                        </ul>
                      </Card>

                      <Card title="💡 冷启动 vs 热启动" type="inner">
                        <table style={{ width: '100%', fontSize: 12, lineHeight: 2 }}>
                          <thead>
                            <tr style={{ color: '#8c8c8c' }}>
                              <th style={{ textAlign: 'left', paddingBottom: 6 }}>对比项</th>
                              <th style={{ textAlign: 'left', color: '#722ed1' }}>冷启动</th>
                              <th style={{ textAlign: 'left', color: '#fa8c16' }}>热启动</th>
                            </tr>
                          </thead>
                          <tbody style={{ color: '#595959' }}>
                            <tr><td>是否需要APK</td><td>✅ 必需</td><td>❌ 不需要</td></tr>
                            <tr><td>APP状态</td><td>首次安装</td><td>后台已驻留</td></tr>
                            <tr><td>启动耗时</td><td>较长</td><td>较短</td></tr>
                            <tr><td>测试严格度</td><td>最严苛</td><td>日常场景</td></tr>
                            <tr><td>依赖条件</td><td>包名/版本一致性</td><td>APP已安装</td></tr>
                          </tbody>
                        </table>
                      </Card>
                    </Col>
                  </Row>

                  <Divider />
                  {renderHotResult()}
                </div>
              )
            }
          ]}
        />
      </div>
    </div>
  );
};

// APP选择器组件
const SelectLike: React.FC<{
  apps: any[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
  loading?: boolean;
}> = ({ apps, value, onChange, placeholder, loading }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = apps.filter((a) =>
    !search || a.appName.toLowerCase().includes(search.toLowerCase()) || a.packageName.toLowerCase().includes(search.toLowerCase())
  );
  const selected = apps.find((a) => a.packageName === value);

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          border: `1px solid ${open ? '#1677ff' : '#d9d9d9'}`,
          borderRadius: 6,
          padding: '6px 11px',
          minHeight: 32,
          cursor: 'pointer',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: loading ? 0.7 : 1
        }}
      >
        <span style={{ color: value ? '#1f1f1f' : '#bfbfbf' }}>
          {selected ? `${selected.appName} (${selected.packageName})` : placeholder}
        </span>
        <span style={{ color: '#bfbfbf', fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading && <Spin size="small" />}
          <span>▾</span>
        </span>
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            marginTop: 4,
            boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
            maxHeight: 320,
            overflow: 'auto'
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 APP 名称或包名"
              style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 12, outline: 'none' }}
            />
            {loading && <Spin size="small" />}
          </div>
          {loading && filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <Spin />
              <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>正在加载 APP 列表...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#8c8c8c', fontSize: 12 }}>
              {apps.length === 0 ? '还没有应用，请点右上角【刷新】' : '无匹配APP'}
            </div>
          ) : (
            filtered.map((app) => (
              <div
                key={app.packageName}
                onClick={() => { onChange(app.packageName); setOpen(false); setSearch(''); }}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid #fafafa',
                  cursor: 'pointer',
                  background: value === app.packageName ? '#e6f4ff' : 'transparent'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {app.appName}
                  {app.versionName && <Tag color="geekblue" style={{ marginLeft: 6, fontSize: 10, padding: 0, lineHeight: '16px' }}>v{app.versionName}</Tag>}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#8c8c8c' }}>{app.packageName}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default StartTestPage;
