import React, { useState, useEffect } from 'react';
import {
  Table, Button, Tag, Space, Card, Radio, Dropdown, message, Modal,
  Result, Descriptions, Empty, Tooltip, Popconfirm, Badge, Segmented, App as AntApp,
  Row, Col, Alert
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HistoryOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined,
  FileExcelOutlined, FilePdfOutlined, FilePptOutlined, DashboardOutlined
} from '@ant-design/icons';
import { useAppStore } from '../store/appStore';
import dayjs from 'dayjs';
import type { TestRecord } from '../../shared/types';
import { EXPORT_FORMATS } from '../../shared/types';

interface Props {
  onBack: () => void;
}

type FormatType = 'pdf' | 'ppt' | 'excel';

const formatDuration = (ms: number) => {
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}秒`;
  return `${(ms / 60000).toFixed(1)}分钟`;
};

// 手动实现相对时间，避免 dayjs 插件依赖
const relativeFromNow = (ts: number): string => {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return '刚刚';
  if (diff < hr) return `${Math.floor(diff / min)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hr)}小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}天前`;
  return dayjs(ts).format('YYYY-MM-DD');
};

const HistoryPage: React.FC<Props> = ({ onBack }) => {
  const { historyRecords, setHistoryRecords, setLoadingHistory } = useAppStore();
  const [viewType, setViewType] = useState<'list' | 'detail'>('list');
  const [detailRecord, setDetailRecord] = useState<TestRecord | null>(null);
  const [filter, setFilter] = useState<string>('all');
  AntApp.useApp?.();

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    if (!window.electronApi) {
      // mock数据
      setLoadingHistory(true);
      setTimeout(() => {
        const mocks: TestRecord[] = Array.from({ length: 5 }, (_, i) => ({
          id: 'mock_' + i,
          deviceId: 'emulator-5554',
          deviceInfo: {
            id: 'emulator-5554',
            model: ['Pixel 6 Pro', '小米 13', '华为 Mate 60 Pro'][i % 3],
            systemVersion: 'Android 13',
            status: 'connected',
            serialNumber: 'emulator-5554',
            brand: ['Google', 'Xiaomi', 'Huawei'][i % 3]
          },
          packageName: ['com.tencent.mm', 'com.eg.android.AlipayGphone', 'tv.danmaku.bili'][i % 3],
          appInfo: {
            packageName: ['com.tencent.mm', 'com.eg.android.AlipayGphone', 'tv.danmaku.bili'][i % 3],
            appName: ['微信', '支付宝', '哔哩哔哩'][i % 3],
            versionName: ['8.0.44', '10.5.20', '7.30.0'][i % 3],
            versionCode: 2000 + i
          },
          startTime: Date.now() - (i + 1) * 3600 * 1000 * 2 - i * 86400000,
          endTime: Date.now() - i * 3600 * 1000 * 2,
          status: 'completed',
          thresholdConfig: useAppStore.getState().thresholds,
          cpuData: [],
          batteryData: [],
          memoryData: [],
          gpuData: [],
          alerts: i % 2 === 0 ? Array.from({ length: i + 3 }).map((_, j) => ({
            id: 'a_' + i + '_' + j,
            type: ['cpu', 'memory', 'gpu', 'battery'][j % 4] as any,
            metric: '指标告警',
            value: 80 + j * 5,
            threshold: 60,
            startTime: Date.now(),
            deviceId: '1',
            packageName: 'com.tencent.mm',
            severity: j % 2 === 0 ? 'critical' : 'warning'
          })) : []
        }));
        setHistoryRecords(mocks);
        setLoadingHistory(false);
      }, 800);
      return;
    }

    try {
      setLoadingHistory(true);
      const records = await window.electronApi.getHistoryRecords();
      setHistoryRecords(records);
    } catch (e: any) {
      message.error('加载历史记录失败: ' + e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredRecords = historyRecords.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'alert') return r.alerts.length > 0;
    if (filter === 'ok') return r.alerts.length === 0;
    return true;
  });

  const exportReport = async (record: TestRecord, format: FormatType) => {
    const fmtLabels: Record<FormatType, string> = { pdf: 'PDF', ppt: 'PPT', excel: 'Excel' };
    const extMap: Record<FormatType, string> = { pdf: 'pdf', ppt: 'pptx', excel: 'xlsx' };
    const filters: any = [
      { name: `${fmtLabels[format]} 文件`, extensions: [extMap[format]] }
    ];
    const defaultName = `${record.appInfo.appName}_性能测试报告_${dayjs(record.startTime).format('YYYYMMDD_HHmmss')}.${extMap[format]}`;

    let savePath: string | null;
    if (!window.electronApi) {
      savePath = `/mock/reports/${defaultName}`;
    } else {
      savePath = await window.electronApi.selectSavePath(defaultName, filters);
    }

    if (!savePath) return;

    try {
      const hide = message.loading(`正在导出${fmtLabels[format]}报告...`, 0);
      let result: string | null;
      if (!window.electronApi) {
        await new Promise((r) => setTimeout(r, 1500));
        result = savePath;
      } else {
        result = await window.electronApi.exportReport({
          format,
          savePath,
          recordId: record.id,
          includeCharts: true,
          includeAlerts: true
        });
      }
      hide();
      if (result) {
        message.success(`${fmtLabels[format]}报告已导出至:\n${result}`);
      } else {
        message.error('导出失败');
      }
    } catch (e: any) {
      message.error('导出失败: ' + e.message);
    }
  };

  const deleteRecord = async (recordId: string) => {
    try {
      let ok: boolean;
      if (!window.electronApi) {
        ok = true;
        setTimeout(() => {}, 200);
      } else {
        ok = await window.electronApi.deleteHistoryRecord(recordId);
      }
      if (ok) {
        setHistoryRecords(historyRecords.filter((r) => r.id !== recordId));
        message.success('记录已删除');
      }
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns: ColumnsType<TestRecord> = [
    {
      title: '测试时间',
      dataIndex: 'startTime',
      width: 170,
      fixed: 'left' as const,
      sorter: (a, b) => a.startTime - b.startTime,
      defaultSortOrder: 'descend' as const,
      render: (v) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{dayjs(v).format('YYYY-MM-DD HH:mm')}</div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>{relativeFromNow(v)}</div>
        </div>
      )
    },
    {
      title: '设备信息',
      dataIndex: 'deviceInfo',
      width: 200,
      render: (d) => (
        <div>
          <div style={{ fontWeight: 600 }}>
            {d.model}
            {d.brand && <Tag color="blue" style={{ marginLeft: 6, fontSize: 10, padding: '0 4px' }}>{d.brand}</Tag>}
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>{d.systemVersion}</div>
        </div>
      )
    },
    {
      title: '被测APP',
      dataIndex: 'appInfo',
      width: 200,
      render: (a) => (
        <div>
          <div style={{ fontWeight: 600 }}>{a.appName}</div>
          <div style={{ fontSize: 11, color: '#8c8c8c', fontFamily: 'monospace' }}>{a.packageName}</div>
          <div style={{ fontSize: 11 }}>{a.versionName && <Tag color="geekblue" style={{ fontSize: 10 }}>v{a.versionName}</Tag>}</div>
        </div>
      )
    },
    {
      title: '测试时长',
      width: 110,
      render: (_, r) => {
        if (!r.endTime) return '-';
        return <Tag color="purple">{formatDuration(r.endTime - r.startTime)}</Tag>;
      }
    },
    {
      title: '告警数',
      width: 100,
      dataIndex: 'alerts',
      sorter: (a, b) => a.alerts.length - b.alerts.length,
      render: (arr) => {
        const criticalCount = arr.filter((a: any) => a.severity === 'critical').length;
        const warnCount = arr.length - criticalCount;
        return (
          <Space size={4}>
            {criticalCount > 0 && <Badge count={criticalCount} color="#ff4d4f" />}
            {warnCount > 0 && <Badge count={warnCount} color="#faad14" />}
            {arr.length === 0 && <Tag color="green">无</Tag>}
          </Space>
        );
      }
    },
    {
      title: '状态',
      width: 100,
      dataIndex: 'status',
      render: (s) => {
        const map: Record<string, { color: string; text: string }> = {
          completed: { color: 'green', text: '已完成' },
          running: { color: 'blue', text: '进行中' },
          interrupted: { color: 'orange', text: '已中断' }
        };
        const m = map[s] || map.completed;
        return <Tag color={m.color}>{m.text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setDetailRecord(r); setViewType('detail'); }}>
            详情
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'excel',
                  icon: <FileExcelOutlined style={{ color: '#52c41a' }} />,
                  label: '导出 Excel',
                  onClick: () => exportReport(r, 'excel')
                },
                {
                  key: 'pdf',
                  icon: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
                  label: '导出 PDF',
                  onClick: () => exportReport(r, 'pdf')
                },
                {
                  key: 'ppt',
                  icon: <FilePptOutlined style={{ color: '#fa8c16' }} />,
                  label: '导出 PPT',
                  onClick: () => exportReport(r, 'ppt')
                }
              ]
            }}
            trigger={['click']}
          >
            <Button size="small" type="primary" icon={<DownloadOutlined />}>
              导出报告
            </Button>
          </Dropdown>
          <Popconfirm
            title="删除该测试记录？"
            description="删除后不可恢复"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteRecord(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  if (viewType === 'detail' && detailRecord) {
    const critical = detailRecord.alerts.filter((a) => a.severity === 'critical').length;
    const warnings = detailRecord.alerts.length - critical;

    return (
      <div className="content-area">
        <div className="content-header">
          <Space>
            <Button onClick={() => { setViewType('list'); setDetailRecord(null); }} icon={<HistoryOutlined />}>
              返回列表
            </Button>
            <h3 style={{ margin: 0 }}>测试记录详情 - {detailRecord.appInfo.appName}</h3>
            <Tag color="blue">{detailRecord.deviceInfo.model}</Tag>
          </Space>
          <Space>
            <Dropdown
              menu={{
                items: [
                  { key: 'excel', icon: <FileExcelOutlined style={{ color: '#52c41a' }} />, label: '导出 Excel', onClick: () => exportReport(detailRecord, 'excel') },
                  { key: 'pdf', icon: <FilePdfOutlined style={{ color: '#ff4d4f' }} />, label: '导出 PDF', onClick: () => exportReport(detailRecord, 'pdf') },
                  { key: 'ppt', icon: <FilePptOutlined style={{ color: '#fa8c16' }} />, label: '导出 PPT', onClick: () => exportReport(detailRecord, 'ppt') }
                ]
              }}
              trigger={['click']}
            >
              <Button type="primary" icon={<DownloadOutlined />}>一键导出报告</Button>
            </Dropdown>
            <Button onClick={onBack} icon={<DashboardOutlined />}>返回监控</Button>
          </Space>
        </div>

        <div className="content-body">
          <Card
            style={{ marginBottom: 16 }}
            title="📄 基础信息"
            extra={detailRecord.alerts.length > 0 ? (
              <Space>
                {critical > 0 && <Tag color="red">严重告警 {critical}</Tag>}
                {warnings > 0 && <Tag color="gold">警告 {warnings}</Tag>}
              </Space>
            ) : <Tag color="green">✅ 无告警</Tag>}
          >
            <Descriptions column={4} size="small" bordered>
              <Descriptions.Item label="记录ID">{detailRecord.id}</Descriptions.Item>
              <Descriptions.Item label="开始时间">{dayjs(detailRecord.startTime).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="结束时间">{detailRecord.endTime ? dayjs(detailRecord.endTime).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
              <Descriptions.Item label="测试时长">
                {detailRecord.endTime ? formatDuration(detailRecord.endTime - detailRecord.startTime) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="设备型号" span={2}>{detailRecord.deviceInfo.model} ({detailRecord.deviceInfo.brand})</Descriptions.Item>
              <Descriptions.Item label="系统版本">{detailRecord.deviceInfo.systemVersion}</Descriptions.Item>
              <Descriptions.Item label="序列号">{detailRecord.deviceInfo.serialNumber}</Descriptions.Item>
              <Descriptions.Item label="APP名称" span={2}>
                {detailRecord.appInfo.appName}
                {detailRecord.appInfo.versionName && <Tag color="geekblue" style={{ marginLeft: 6 }}>v{detailRecord.appInfo.versionName}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="包名" span={2}>
                <code style={{ fontFamily: 'monospace', fontSize: 12, background: '#fafafa', padding: '2px 6px', borderRadius: 3 }}>
                  {detailRecord.appInfo.packageName}
                </code>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <StatCard title="CPU 采样数" value={detailRecord.cpuData.length} color="#fa8c16" />
            </Col>
            <Col span={6}>
              <StatCard title="电量 采样数" value={detailRecord.batteryData.length} color="#52c41a" />
            </Col>
            <Col span={6}>
              <StatCard title="内存 采样数" value={detailRecord.memoryData.length} color="#13c2c2" />
            </Col>
            <Col span={6}>
              <StatCard title="GPU 采样数" value={detailRecord.gpuData.length} color="#eb2f96" />
            </Col>
          </Row>

          {detailRecord.alerts.length > 0 && (
            <Card title="⚠️ 超限告警汇总" style={{ marginBottom: 16 }}>
              <Table
                size="small"
                dataSource={detailRecord.alerts}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: '#', dataIndex: 'id', width: 60, render: (_, __, i) => i + 1 },
                  {
                    title: '类型',
                    dataIndex: 'type',
                    width: 100,
                    render: (v) => {
                      const map: Record<string, string> = { cpu: 'CPU', battery: '电量', memory: '内存', gpu: 'GPU', coldStart: '冷启动', hotStart: '热启动' };
                      return <Tag color="purple">{map[v] || v}</Tag>;
                    }
                  },
                  { title: '指标', dataIndex: 'metric' },
                  { title: '超限数值', dataIndex: 'value', width: 100, render: (v, r) => <span style={{ color: r.severity === 'critical' ? '#ff4d4f' : '#faad16', fontWeight: 600 }}>{v}</span> },
                  { title: '阈值', dataIndex: 'threshold', width: 100 },
                  { title: '严重程度', dataIndex: 'severity', width: 100, render: (v) => <Tag color={v === 'critical' ? 'red' : 'gold'}>{v === 'critical' ? '严重' : '警告'}</Tag> },
                  { title: '发生时间', dataIndex: 'startTime', width: 160, render: (v) => dayjs(v).format('HH:mm:ss') }
                ]}
              />
            </Card>
          )}

          {detailRecord.coldStartData && (
            <Card title="🚀 冷启动测试结果" style={{ marginBottom: 16 }}>
              <Alert type="success" showIcon message={`启动耗时 ${detailRecord.coldStartData.totalStartTime}ms，首帧 ${detailRecord.coldStartData.firstFrameTime}ms`} />
            </Card>
          )}
          {detailRecord.hotStartData && (
            <Card title="⚡ 热启动测试结果" style={{ marginBottom: 16 }}>
              <Alert type="success" showIcon message={`总耗时 ${detailRecord.hotStartData.totalStartTime}ms，首屏 ${detailRecord.hotStartData.firstScreenTime}ms`} />
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="content-header">
        <Space>
          <Button onClick={onBack} icon={<DashboardOutlined />}>返回监控</Button>
          <h3 style={{ margin: 0 }}><HistoryOutlined style={{ color: '#1677ff', marginRight: 6 }} />历史测试记录</h3>
          <Tag color="blue">{historyRecords.length} 条记录</Tag>
        </Space>
        <Space>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as string)}
            options={[
              { label: '全部', value: 'all' },
              { label: `有告警 (${historyRecords.filter(r => r.alerts.length > 0).length})`, value: 'alert' },
              { label: `无异常 (${historyRecords.filter(r => r.alerts.length === 0).length})`, value: 'ok' }
            ]}
          />
          <Button icon={<HistoryOutlined />} onClick={loadRecords}>刷新</Button>
          {historyRecords.length > 0 && (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'all-excel', icon: <FileExcelOutlined style={{ color: '#52c41a' }} />, label: '批量导出Excel',
                    disabled: true
                  }
                ]
              }}
            >
              <Button icon={<DownloadOutlined />}>批量操作</Button>
            </Dropdown>
          )}
        </Space>
      </div>

      <div className="content-body">
        <Card bodyStyle={{ padding: 0 }}>
          <Table
            columns={columns}
            dataSource={filteredRecords}
            rowKey="id"
            size="middle"
            loading={useAppStore.getState().isLoadingHistory}
            scroll={{ x: 1100 }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条记录`
            }}
            locale={{ emptyText: <Empty description="暂无历史记录，开始一次性能测试吧" style={{ padding: 60 }} /> }}
          />
        </Card>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: number; color: string }> = ({ title, value, color }) => (
  <div style={{
    padding: 16, background: '#fff', borderRadius: 8, border: `1px solid #f0f0f0`,
    borderLeft: `4px solid ${color}`
  }}>
    <div style={{ fontSize: 12, color: '#8c8c8c' }}>{title}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 4 }}>{value.toLocaleString()}</div>
  </div>
);

// 未使用的类型导出占位（避免lint）
export const __unused = EXPORT_FORMATS;

export default HistoryPage;
