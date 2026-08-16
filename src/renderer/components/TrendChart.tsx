import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import type { CpuData, BatteryData, MemoryData, GpuData } from '../../shared/types';

interface TrendChartProps {
  title: string;
  data: any[];
  series: Array<{
    key: string;
    name: string;
    color: string;
    unit?: string;
    type?: 'line' | 'bar';
    area?: boolean;
  }>;
  threshold?: { value: number; label: string; color?: string };
  height?: number;
  warningColor?: string;
  criticalColor?: string;
}

const TrendChart: React.FC<TrendChartProps> = ({
  title,
  data,
  series,
  threshold,
  height = 240,
  warningColor = '#faad14',
  criticalColor = '#ff4d4f'
}) => {
  const option = useMemo(() => {
    const times = data.map((d, i) => {
      if (d.timestamp) {
        const date = new Date(d.timestamp);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      }
      return `#${i + 1}`;
    });

    const seriesConfig = series.map((s) => {
      const seriesData = data.map((d) => d[s.key]);
      return {
        name: s.name,
        type: s.type || 'line',
        smooth: true,
        symbol: 'none',
        sampling: 'lttb',
        showSymbol: false,
        itemStyle: { color: s.color },
        lineStyle: { color: s.color, width: 2 },
        areaStyle: s.area
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: s.color + '40' },
                { offset: 1, color: s.color + '05' }
              ])
            }
          : undefined,
        data: seriesData,
        markLine:
          threshold && s.key === series[0].key
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: {
                  color: threshold.color || criticalColor,
                  type: 'dashed',
                  width: 1
                },
                label: {
                  formatter: threshold.label,
                  color: threshold.color || criticalColor,
                  fontSize: 10,
                  position: 'end'
                },
                data: [{ yAxis: threshold.value }]
              }
            : undefined
      };
    });

    return {
      backgroundColor: 'transparent',
      title: {
        text: title,
        textStyle: { fontSize: 13, fontWeight: 600, color: '#1f1f1f' },
        left: 0,
        top: 4
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        axisPointer: { lineStyle: { color: '#1677ff', type: 'dashed' } }
      },
      legend: {
        data: series.map((s) => s.name),
        right: 0,
        top: 0,
        textStyle: { fontSize: 11, color: '#8c8c8c' },
        itemWidth: 12,
        itemHeight: 6,
        itemGap: 12
      },
      grid: {
        left: 45,
        right: 15,
        top: 40,
        bottom: 28,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: '#f0f0f0' } },
        axisLabel: {
          fontSize: 10,
          color: '#8c8c8c',
          interval: Math.max(0, Math.floor(times.length / 8) - 1)
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 10,
          color: '#8c8c8c',
          formatter: series[0]?.unit ? `{value}${series[0].unit}` : undefined
        },
        splitLine: { lineStyle: { color: '#f5f5f5', type: 'dashed' } }
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100
        }
      ],
      series: seriesConfig
    };
  }, [data, series, threshold, title]);

  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: '#bfbfbf',
          fontSize: 12
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.5 }}>📊</div>
        <div>{title} 暂无数据</div>
        <div style={{ marginTop: 2, fontSize: 11, color: '#d9d9d9' }}>请开启监控后查看实时趋势</div>
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      notMerge
      lazyUpdate
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default TrendChart;
