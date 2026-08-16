import React, { useEffect } from 'react';
import {
  Drawer, List, Tag, Button, Empty, Badge, Space, Tooltip, Typography, Segmented, message, Popconfirm
} from 'antd';
import {
  BellOutlined, ClearOutlined, DeleteOutlined,
  DashboardOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { useAppStore } from '../store/appStore';
import dayjs from 'dayjs';
import type { ThresholdAlert } from '../../shared/types';

const { Text } = Typography;

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  cpu: { label: 'CPU', color: '#fa8c16', icon: '🧠' },
  battery: { label: '电量', color: '#52c41a', icon: '🔋' },
  memory: { label: '内存', color: '#13c2c2', icon: '💾' },
  gpu: { label: 'GPU', color: '#eb2f96', icon: '🎮' },
  coldStart: { label: '冷启动', color: '#722ed1', icon: '🚀' },
  hotStart: { label: '热启动', color: '#fa8c16', icon: '⚡' }
};

interface Props {
  open: boolean;
  onClose: () => void;
}

const AlertsPanel: React.FC<Props> = ({ open, onClose }) => {
  const { alerts, clearAlerts, setCurrentView, selectedDeviceId, devices } = useAppStore();
  const [filter, setFilter] = React.useState<string>('all');

  // 注册全局告警回调
  useEffect(() => {
    if (!window.electronApi) return;
    const unsub = window.electronApi.onAlertOccurred((alert: ThresholdAlert) => {
      const meta = TYPE_META[alert.type] || { label: alert.type, color: '#999', icon: '⚠️' };
      message.open({
        type: alert.severity === 'critical' ? 'error' : 'warning',
        content: (
          <span>
            {meta.icon} <b>[{meta.label}]</b> {alert.metric}: {alert.value} {'>'} 阈值 {alert.threshold}
          </span>
        ),
        duration: 3,
        style: { marginTop: 40 }
      });
    });
    return unsub;
  }, []);

  const filtered = alerts.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'critical') return a.severity === 'critical';
    if (filter === 'warning') return a.severity === 'warning';
    return filter === a.type;
  });

  const deviceMap = devices.reduce((m, d) => ((m[d.id] = d.model), m), {} as Record<string, string>);

  return (
    <Drawer
      title={
        <Space>
          <Badge count={alerts.length} size="small" offset={[4, -2]}>
            <BellOutlined style={{ fontSize: 18, color: alerts.length > 0 ? '#ff4d4f' : undefined }} />
          </Badge>
          <span style={{ fontWeight: 600 }}>超限告警中心</span>
          <Tag color="blue" style={{ marginLeft: 6 }}>{alerts.length} 条</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={420}
      extra={
        <Space>
          <Popconfirm
            title="确认清空所有告警记录？"
            onConfirm={() => { clearAlerts(); message.success('已清空告警'); }}
          >
            <Button size="small" icon={<ClearOutlined />} disabled={alerts.length === 0}>清空</Button>
          </Popconfirm>
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Segmented
          block
          size="small"
          value={filter}
          onChange={(v) => setFilter(v as string)}
          options={[
            { label: '全部', value: 'all' },
            { label: '严重', value: 'critical' },
            { label: '警告', value: 'warning' },
            { label: 'CPU', value: 'cpu' },
            { label: '电量', value: 'battery' },
            { label: '内存', value: 'memory' },
            { label: 'GPU', value: 'gpu' }
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty
          description={
            <div>
              <div style={{ color: '#595959' }}>
                {alerts.length === 0 ? '🎉 太棒了，暂无告警' : '没有符合条件的告警'}
              </div>
              <div style={{ fontSize: 12, color: '#bfbfbf', marginTop: 6 }}>
                {alerts.length === 0 ? '所有指标均在正常阈值范围内运行' : '请切换其他分类查看'}
              </div>
            </div>
          }
          style={{ padding: 40 }}
        />
      ) : (
        <List
          dataSource={filtered}
          locale={{ emptyText: '暂无数据' }}
          renderItem={(alert: ThresholdAlert, idx: number) => {
            const meta = TYPE_META[alert.type] || { label: alert.type, color: '#999', icon: '⚠️' };
            return (
              <List.Item
                key={alert.id}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  background: alert.severity === 'critical' ? '#fff1f0' : '#fffbe6',
                  borderRadius: 6,
                  borderLeft: `4px solid ${alert.severity === 'critical' ? '#ff4d4f' : '#faad14'}`,
                  alignItems: 'flex-start'
                }}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: 8,
                        background: meta.color + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20
                      }}
                    >
                      {meta.icon}
                    </div>
                  }
                  title={
                    <Space>
                      <Tag color={meta.color} style={{ fontWeight: 600 }}>{meta.label}</Tag>
                      <Tag color={alert.severity === 'critical' ? 'red' : 'gold'}>
                        {alert.severity === 'critical' ? '严重超限' : '一般警告'}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        #{filtered.length - idx}
                      </Text>
                    </Space>
                  }
                  description={
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ color: '#8c8c8c' }}>指标：</span>
                        <Text strong>{alert.metric}</Text>
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ color: '#8c8c8c' }}>超限值：</span>
                        <Text strong style={{
                          color: alert.severity === 'critical' ? '#ff4d4f' : '#fa8c16',
                          fontSize: 15
                        }}>
                          {alert.value}
                        </Text>
                        <span style={{ color: '#bfbfbf', margin: '0 6px' }}>→</span>
                        <span style={{ color: '#8c8c8c' }}>阈值: {alert.threshold}</span>
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(alert.startTime).format('MM-DD HH:mm:ss')}
                          {alert.duration && ` · 持续${(alert.duration / 1000).toFixed(1)}s`}
                          {deviceMap[alert.deviceId] && ` · 设备: ${deviceMap[alert.deviceId]}`}
                        </Text>
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#bfbfbf' }}>
                        {alert.packageName}
                      </div>
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}

      <div
        style={{
          position: 'absolute', bottom: 16, left: 16, right: 16,
          padding: 12, borderRadius: 6, background: '#fafafa', border: '1px dashed #d9d9d9',
          fontSize: 12, color: '#8c8c8c'
        }}
      >
        💡 提示：告警数据会自动保存到测试报告中，可在历史记录页面查看完整的超限汇总。
      </div>
    </Drawer>
  );
};

export default AlertsPanel;
