import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';
// ⭐ type-only import：纯 TypeScript 类型，不产生任何运行时 require('electron') 代码
// 避免顶层 electron 模块加载时机/打包 externals 兼容问题导致主界面白屏或启动崩溃
import type { BrowserWindow as BrowserWindowType } from 'electron';
import type { StorageService } from './StorageService';
import type {
  ExportConfig,
  TestRecord,
  ThresholdAlert,
  CpuData,
  BatteryData,
  MemoryData,
  GpuData
} from '../../shared/types';

/**
 * 报告导出服务 - 支持 PDF / PPT / Excel 三种格式
 */
export class ReportExportService {
  constructor(private storage: StorageService) {}

  async exportReport(config: ExportConfig): Promise<string | null> {
    const record = await this.storage.getTestRecordById(config.recordId);
    if (!record) throw new Error('测试记录不存在');

    switch (config.format) {
      case 'excel':
        return this.exportExcel(record, config.savePath);
      case 'pdf':
        return this.exportPdf(record, config.savePath);
      case 'ppt':
        return this.exportPpt(record, config.savePath);
      default:
        return this.exportExcel(record, config.savePath);
    }
  }

  private formatDate(ts: number): string {
    return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
  }

  private getStatusColor(value: number, threshold: number, higherIsBad = true): 'normal' | 'warning' | 'critical' {
    if (higherIsBad) {
      if (value <= threshold) return 'normal';
      if (value <= threshold * 1.1) return 'warning';
      return 'critical';
    } else {
      if (value >= threshold) return 'normal';
      if (value >= threshold * 0.9) return 'warning';
      return 'critical';
    }
  }

  private getColorHex(status: 'normal' | 'warning' | 'critical'): string {
    return status === 'normal' ? '#52c41a' : status === 'warning' ? '#faad14' : '#ff4d4f';
  }

  // ============== Excel 导出 ==============
  private async exportExcel(record: TestRecord, savePath: string): Promise<string | null> {
    try {
      // 动态导入 exceljs
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();

      workbook.creator = '手机APP检测监控软件';
      workbook.created = new Date();
      workbook.title = `性能测试报告_${record.appInfo.appName}`;

      // ---------- 1. 报告概览页 ----------
      const ws1 = workbook.addWorksheet('报告概览', { properties: { tabColor: { argb: 'FF1890FF' } } });

      ws1.columns = [
        { key: 'k', width: 25 },
        { key: 'v', width: 50 }
      ];

      const overviewData = [
        ['报告标题', `APP性能测试报告 - ${record.appInfo.appName}`],
        ['生成时间', this.formatDate(Date.now())],
        ['', ''],
        ['设备信息', ''],
        ['  设备型号', record.deviceInfo.model],
        ['  品牌', record.deviceInfo.brand || '-'],
        ['  系统版本', record.deviceInfo.systemVersion],
        ['  设备序列号', record.deviceInfo.serialNumber],
        ['  总内存', record.deviceInfo.memoryTotal ? `${record.deviceInfo.memoryTotal} MB` : '-'],
        ['', ''],
        ['APP信息', ''],
        ['  应用名称', record.appInfo.appName],
        ['  包名', record.appInfo.packageName],
        ['  版本号', record.appInfo.versionName || '-'],
        ['', ''],
        ['测试信息', ''],
        ['  测试开始时间', this.formatDate(record.startTime)],
        ['  测试结束时间', record.endTime ? this.formatDate(record.endTime) : '-'],
        ['  测试时长(秒)', record.endTime ? Math.round((record.endTime - record.startTime) / 1000) : '-'],
        ['  测试状态', record.status === 'completed' ? '已完成' : '中断'],
        ['  超限告警数', record.alerts.length]
      ];

      overviewData.forEach((row) => {
        const r = ws1.addRow({ k: row[0], v: row[1] });
        const kStr = typeof row[0] === 'string' ? row[0] : String(row[0]);
        if (kStr && !kStr.startsWith('  ') && row[1] === '') {
          r.font = { bold: true, size: 12, color: { argb: 'FF1890FF' } };
          r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F7FF' } };
        }
      });

      // ---------- 2. 阈值配置页 ----------
      const ws2 = workbook.addWorksheet('阈值配置', { properties: { tabColor: { argb: 'FF722ED1' } } });
      ws2.columns = [
        { key: 'category', width: 15, header: '指标分类' },
        { key: 'metric', width: 25, header: '指标名称' },
        { key: 'value', width: 15, header: '阈值' },
        { key: 'unit', width: 10, header: '单位' }
      ];

      const t = record.thresholdConfig;
      const thresholdRows = [
        ['CPU监控', 'APP瞬时CPU占用率', t.cpu.appCpuUsage, '%'],
        ['CPU监控', '整机CPU占用率', t.cpu.systemCpuUsage, '%'],
        ['CPU监控', '后台静置CPU消耗', t.cpu.backgroundCpuUsage, '%'],
        ['电量监控', '常规场景每分钟耗电', t.battery.normalPowerPerMin, '%'],
        ['电量监控', '高负载场景每分钟耗电', t.battery.highLoadPowerPerMin, '%'],
        ['电量监控', '无效耗电占比', t.battery.invalidPowerRatio, '%'],
        ['内存监控', '峰值物理内存占用', t.memory.peakPhysicalMemory, 'MB'],
        ['内存监控', '后台留存内存', t.memory.backgroundMemory, 'MB'],
        ['内存监控', '单次启动内存增量', t.memory.startupMemoryIncrement, 'MB'],
        ['GPU监控', 'GPU占用率', t.gpu.gpuUsage, '%'],
        ['GPU监控', '最低帧率', t.gpu.minFps, 'FPS'],
        ['GPU监控', '帧率波动', t.gpu.fpsFluctuation, 'FPS'],
        ['GPU监控', '单秒卡顿次数', t.gpu.jankCountPerSecond, '次'],
        ['冷启动', '总耗时', t.coldStart.totalTime, 'ms'],
        ['冷启动', '首帧渲染耗时', t.coldStart.firstFrameTime, 'ms'],
        ['冷启动', '流量消耗', t.coldStart.trafficConsumption, 'MB'],
        ['热启动', '总耗时', t.hotStart.totalTime, 'ms'],
        ['热启动', '首屏加载耗时', t.hotStart.firstScreenTime, 'ms']
      ];

      thresholdRows.forEach((row, idx) => {
        ws2.addRow({ category: row[0], metric: row[1], value: row[2], unit: row[3] });
      });
      ws2.getRow(1).font = { bold: true };
      ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EBFF' } };

      // ---------- 3. CPU数据页 ----------
      if (record.cpuData.length > 0) {
        const ws3 = workbook.addWorksheet('CPU监控数据', { properties: { tabColor: { argb: 'FFFA8C16' } } });
        ws3.columns = [
          { key: 'time', width: 20, header: '采集时间' },
          { key: 'app', width: 15, header: 'APP CPU(%)' },
          { key: 'sys', width: 15, header: '整机CPU(%)' },
          { key: 'peak', width: 15, header: 'CPU峰值(%)' },
          { key: 'status', width: 10, header: '状态' }
        ];

        record.cpuData.forEach((d: CpuData) => {
          const status = d.appCpuUsage > t.cpu.appCpuUsage ? '异常' : '正常';
          const r = ws3.addRow({
            time: this.formatDate(d.timestamp),
            app: d.appCpuUsage,
            sys: d.systemCpuUsage,
            peak: d.peakCpuUsage,
            status
          });
          if (status === '异常') {
            r.font = { color: { argb: 'FFFF4D4F' } };
            r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F0' } };
          }
        });
        ws3.getRow(1).font = { bold: true };

        // CPU统计汇总
        const cpuPeak = Math.max(...record.cpuData.map((d) => d.appCpuUsage));
        const cpuAvg = record.cpuData.reduce((s, d) => s + d.appCpuUsage, 0) / record.cpuData.length;
        ws3.addRow({});
        ws3.addRow({ time: '统计汇总', app: `均值: ${cpuAvg.toFixed(1)}%`, sys: `峰值: ${cpuPeak}%` });
      }

      // ---------- 4. 电量数据页 ----------
      if (record.batteryData.length > 0) {
        const ws4 = workbook.addWorksheet('电量监控数据', { properties: { tabColor: { argb: 'FF52C41A' } } });
        ws4.columns = [
          { key: 'time', width: 20, header: '采集时间' },
          { key: 'level', width: 12, header: '当前电量(%)' },
          { key: 'permin', width: 16, header: '每分钟耗电(%)' },
          { key: 'total', width: 15, header: '累计耗电(%)' },
          { key: 'eff', width: 14, header: '使用效率(%)' },
          { key: 'invalid', width: 14, header: '无效耗电(%)' },
          { key: 'temp', width: 12, header: '温度(℃)' },
          { key: 'status', width: 10, header: '状态' }
        ];

        record.batteryData.forEach((d: BatteryData) => {
          const status = d.powerConsumptionPerMin > t.battery.normalPowerPerMin ? '异常' : '正常';
          const r = ws4.addRow({
            time: this.formatDate(d.timestamp),
            level: d.currentLevel,
            permin: d.powerConsumptionPerMin,
            total: d.totalPowerConsumption,
            eff: d.powerEfficiency,
            invalid: d.invalidPowerRatio,
            temp: d.temperature,
            status
          });
          if (status === '异常') {
            r.font = { color: { argb: 'FFFF4D4F' } };
            r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F0' } };
          }
        });
        ws4.getRow(1).font = { bold: true };
      }

      // ---------- 5. 内存数据页 ----------
      if (record.memoryData.length > 0) {
        const ws5 = workbook.addWorksheet('内存监控数据', { properties: { tabColor: { argb: 'FF13C2C2' } } });
        ws5.columns = [
          { key: 'time', width: 20, header: '采集时间' },
          { key: 'pss', width: 16, header: '物理内存(MB)' },
          { key: 'virtual', width: 16, header: '虚拟内存(MB)' },
          { key: 'peak', width: 14, header: '峰值(MB)' },
          { key: 'native', width: 14, header: 'Native堆' },
          { key: 'dalvik', width: 14, header: 'Dalvik堆' },
          { key: 'leak', width: 12, header: '泄漏疑似' },
          { key: 'status', width: 10, header: '状态' }
        ];

        record.memoryData.forEach((d: MemoryData) => {
          const status = d.physicalMemory > t.memory.peakPhysicalMemory || d.memoryLeaks ? '异常' : '正常';
          const r = ws5.addRow({
            time: this.formatDate(d.timestamp),
            pss: d.physicalMemory,
            virtual: d.virtualMemory,
            peak: d.peakMemory,
            native: d.nativeHeap,
            dalvik: d.dalvikHeap,
            leak: d.memoryLeaks ? '是' : '否',
            status
          });
          if (status === '异常') {
            r.font = { color: { argb: 'FFFF4D4F' } };
            r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F0' } };
          }
        });
        ws5.getRow(1).font = { bold: true };
      }

      // ---------- 6. GPU数据页 ----------
      if (record.gpuData.length > 0) {
        const ws6 = workbook.addWorksheet('GPU监控数据', { properties: { tabColor: { argb: 'FFEB2F96' } } });
        ws6.columns = [
          { key: 'time', width: 20, header: '采集时间' },
          { key: 'gpu', width: 12, header: 'GPU(%)' },
          { key: 'fps', width: 10, header: 'FPS' },
          { key: 'avgFps', width: 12, header: '平均FPS' },
          { key: 'minFps', width: 12, header: '最低FPS' },
          { key: 'fluct', width: 12, header: '波动' },
          { key: 'render', width: 14, header: '渲染(ms)' },
          { key: 'jank', width: 12, header: '卡顿' },
          { key: 'status', width: 10, header: '状态' }
        ];

        record.gpuData.forEach((d: GpuData) => {
          const abnormal =
            d.gpuUsage > t.gpu.gpuUsage ||
            (d.fps > 0 && d.fps < t.gpu.minFps) ||
            d.jankCount > t.gpu.jankCountPerSecond;
          const r = ws6.addRow({
            time: this.formatDate(d.timestamp),
            gpu: d.gpuUsage,
            fps: d.fps,
            avgFps: d.avgFps,
            minFps: d.minFps,
            fluct: d.fpsFluctuation,
            render: d.renderTime,
            jank: d.jankCount,
            status: abnormal ? '异常' : '正常'
          });
          if (abnormal) {
            r.font = { color: { argb: 'FFFF4D4F' } };
            r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F0' } };
          }
        });
        ws6.getRow(1).font = { bold: true };
      }

      // ---------- 7. 告警汇总页 ----------
      if (record.alerts.length > 0) {
        const ws7 = workbook.addWorksheet('超限告警汇总', { properties: { tabColor: { argb: 'FFFF4D4F' } } });
        ws7.columns = [
          { key: 'idx', width: 6, header: '序号' },
          { key: 'type', width: 12, header: '指标类型' },
          { key: 'metric', width: 22, header: '指标名称' },
          { key: 'value', width: 12, header: '超限数值' },
          { key: 'threshold', width: 10, header: '阈值' },
          { key: 'time', width: 20, header: '发生时间' },
          { key: 'severity', width: 10, header: '严重程度' }
        ];

        const typeMap: Record<string, string> = {
          cpu: 'CPU', battery: '电量', memory: '内存', gpu: 'GPU',
          coldStart: '冷启动', hotStart: '热启动'
        };

        record.alerts.forEach((a: ThresholdAlert, idx: number) => {
          const r = ws7.addRow({
            idx: idx + 1,
            type: typeMap[a.type] || a.type,
            metric: a.metric,
            value: a.value,
            threshold: a.threshold,
            time: this.formatDate(a.startTime),
            severity: a.severity === 'critical' ? '严重' : '警告'
          });
          if (a.severity === 'critical') {
            r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F0' } };
            r.font = { color: { argb: 'FFFF4D4F' }, bold: true };
          } else {
            r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBE6' } };
            r.font = { color: { argb: 'FFFA8C16' } };
          }
        });
        ws7.getRow(1).font = { bold: true };
      }

      const finalPath = savePath.endsWith('.xlsx') ? savePath : savePath + '.xlsx';
      await workbook.xlsx.writeFile(finalPath);
      return finalPath;
    } catch (e: any) {
      console.error('Excel导出失败:', e);
      throw new Error('Excel导出失败: ' + e.message);
    }
  }

  // ============== PDF 导出 ==============
  /**
   * ⭐ Issue2 修复：jsPDF 内置 Helvetica 字体完全不支持中文，中文会变问号/方块
   * 改为 Electron 原生 Chromium printToPDF 方案：
   *   1. 组装完整 HTML 页面（中文原生支持，和浏览器看到效果一致）
   *   2. new BrowserWindow(show:false) 离屏加载 data:text/html
   *   3. webContents.printToPDF() 导出 A4 PDF Buffer
   * 优势：零字体文件依赖、中文 100% 显示、自动分页、支持颜色/表格/样式，完全不依赖 jspdf
   */
  private async exportPdf(record: TestRecord, savePath: string): Promise<string | null> {
    let win: BrowserWindowType | null = null;
    try {
      // ⭐⭐⭐ Issue2 再加固：动态 import('electron') + type-only 类型
      // 1. 顶层不再 require('electron')，避免任何主进程启动时的加载/打包兼容问题导致主界面白屏
      // 2. 只有在真正导出 PDF 时才加载 BrowserWindow，不影响启动速度
      const { BrowserWindow: BrowserWindowCtor } = await import('electron');
      if (!BrowserWindowCtor) throw new Error('当前运行环境不支持 Electron BrowserWindow，无法生成 PDF');

      const t = record.thresholdConfig;
      const durationSec = record.endTime ? Math.round((record.endTime - record.startTime) / 1000) : 0;

      // ---------- 统计指标 ----------
      let cpuPeak = 0, cpuAvg = 0, cpuStatus = '正常', cpuColor = '#52c41a';
      if (record.cpuData.length > 0) {
        cpuPeak = Math.max(...record.cpuData.map((d) => d.appCpuUsage));
        cpuAvg = +(record.cpuData.reduce((s, d) => s + d.appCpuUsage, 0) / record.cpuData.length).toFixed(1);
        const st = this.getStatusColor(cpuAvg, t.cpu.appCpuUsage, true);
        cpuStatus = st === 'normal' ? '正常' : st === 'warning' ? '临界' : '超限';
        cpuColor = this.getColorHex(st);
      }

      let memPeak = 0, memAvg = 0, memStatus = '正常', memColor = '#52c41a';
      if (record.memoryData.length > 0) {
        memPeak = Math.max(...record.memoryData.map((d) => d.physicalMemory));
        memAvg = Math.round(record.memoryData.reduce((s, d) => s + d.physicalMemory, 0) / record.memoryData.length);
        const st = this.getStatusColor(memPeak, t.memory.peakPhysicalMemory, true);
        memStatus = st === 'normal' ? '正常' : st === 'warning' ? '临界' : '超限';
        memColor = this.getColorHex(st);
      }

      let avgFps = 0, minFps = 0, fpsStatus = '正常', fpsColor = '#52c41a';
      if (record.gpuData.length > 0) {
        const fpsArr = record.gpuData.map((d) => d.fps).filter((f) => f > 0);
        if (fpsArr.length > 0) {
          avgFps = +(fpsArr.reduce((a, b) => a + b, 0) / fpsArr.length).toFixed(1);
          minFps = Math.min(...fpsArr);
          const st = this.getStatusColor(minFps, t.gpu.minFps, false);
          fpsStatus = st === 'normal' ? '正常' : st === 'warning' ? '临界' : '超限';
          fpsColor = this.getColorHex(st);
        }
      }

      let battConsume = 0, battEff = 0;
      if (record.batteryData.length > 0) {
        const last = record.batteryData[record.batteryData.length - 1];
        battConsume = last.totalPowerConsumption ?? 0;
        battEff = last.powerEfficiency ?? 0;
      }

      const statusText = record.status === 'completed' ? '已完成' : '中断';
      const statusColor = record.status === 'completed' ? '#52c41a' : '#FA8C16';

      const typeMap: Record<string, string> = {
        cpu: 'CPU 监控', battery: '电量监控', memory: '内存监控', gpu: 'GPU 监控',
        coldStart: '冷启动测试', hotStart: '热启动测试'
      };
      const sevText = (s: string) => s === 'critical' ? '严重' : '警告';
      const sevColor = (s: string) => s === 'critical' ? '#FF4D4F' : '#FAAD14';
      const sevBg = (s: string) => s === 'critical' ? '#FFF1F0' : '#FFFBE6';

      // ---------- 组装告警表格 ----------
      const alertRowsHtml = (record.alerts || []).length > 0
        ? `<table class="data-table">
            <thead>
              <tr>
                <th style="width:60px;">序号</th>
                <th style="width:120px;">类型</th>
                <th>指标名称</th>
                <th style="width:110px;">超限值</th>
                <th style="width:100px;">阈值</th>
                <th style="width:100px;">严重度</th>
                <th style="width:180px;">发生时间</th>
              </tr>
            </thead>
            <tbody>
              ${record.alerts.map((a, i) => `
                <tr style="background: ${sevBg(a.severity)};">
                  <td>${i + 1}</td>
                  <td>${typeMap[a.type] || a.type}</td>
                  <td>${a.metric}</td>
                  <td><b style="color: ${sevColor(a.severity)};">${a.value}</b></td>
                  <td>${a.threshold}</td>
                  <td><span class="badge" style="background: ${sevColor(a.severity)}; color:#fff;">${sevText(a.severity)}</span></td>
                  <td>${this.formatDate(a.startTime)}</td>
                </tr>`).join('')}
            </tbody>
          </table>`
        : `<div class="empty">暂无超限告警记录</div>`;

      // ---------- 组装完整 HTML（A4 页面宽度，使用系统字体，中文完美显示） ----------
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>APP性能测试报告 - ${record.appInfo.appName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #262626;
    font-size: 13px;
    line-height: 1.7;
    padding: 28px 32px;
  }
  .cover-title {
    text-align: center;
    color: #1890FF;
    font-size: 32px;
    font-weight: 700;
    padding: 24px 0 8px 0;
    letter-spacing: 2px;
  }
  .cover-sub {
    text-align: center;
    color: #8C8C8C;
    font-size: 13px;
    padding-bottom: 20px;
    border-bottom: 2px solid #E6F7FF;
    margin-bottom: 24px;
  }
  h2.section {
    color: #722ED1;
    font-size: 18px;
    font-weight: 700;
    margin: 22px 0 12px 0;
    padding-left: 10px;
    border-left: 4px solid #722ED1;
  }
  h3.subtitle {
    color: #1890FF;
    font-size: 15px;
    font-weight: 600;
    margin: 14px 0 8px 0;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
    padding: 14px 16px;
    background: #FAFAFA;
    border: 1px solid #F0F0F0;
    border-radius: 6px;
    margin-bottom: 8px;
  }
  .info-grid > div { display: flex; }
  .info-grid .label { width: 110px; color: #8C8C8C; flex-shrink: 0; }
  .info-grid .value { color: #262626; font-weight: 500; word-break: break-all; }

  .kpi-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 12px;
    margin: 12px 0 6px 0;
  }
  .kpi-card {
    border: 1px solid #F0F0F0;
    border-radius: 8px;
    padding: 14px 12px;
    text-align: center;
    background: #fff;
  }
  .kpi-card .kpi-title { color: #595959; font-size: 12px; margin-bottom: 8px; }
  .kpi-card .kpi-value { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .kpi-card .kpi-extra { color: #8C8C8C; font-size: 11px; line-height: 1.5; }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 8px 0;
    font-size: 12.5px;
  }
  .data-table thead th {
    background: #722ED1;
    color: #fff;
    padding: 10px 8px;
    text-align: left;
    font-weight: 600;
    border: 1px solid #6026B0;
  }
  .data-table tbody td {
    padding: 8px;
    border: 1px solid #F0F0F0;
    vertical-align: middle;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
  }
  .status-tag {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
  }
  .empty {
    padding: 24px;
    text-align: center;
    color: #BFBFBF;
    background: #FAFAFA;
    border: 1px dashed #D9D9D9;
    border-radius: 6px;
  }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

  <div class="cover-title">APP性能测试报告</div>
  <div class="cover-sub">
    生成时间：${this.formatDate(Date.now())} &nbsp;&nbsp;|&nbsp;&nbsp; 报告版本：v1.0<br/>
    由「APP性能大师」桌面端软件生成 — 专业级 APP 全维度性能检测与监控平台
  </div>

  <!-- 第 1 章：测试概览 -->
  <h2 class="section">一、测试概览</h2>
  <div class="info-grid">
    <div><span class="label">测试状态：</span><span class="value"><span class="status-tag" style="background:${statusColor}15;color:${statusColor};">● ${statusText}</span></span></div>
    <div><span class="label">测试时长：</span><span class="value">${durationSec} 秒（约 ${(durationSec / 60).toFixed(1)} 分钟）</span></div>
    <div><span class="label">开始时间：</span><span class="value">${this.formatDate(record.startTime)}</span></div>
    <div><span class="label">结束时间：</span><span class="value">${record.endTime ? this.formatDate(record.endTime) : '-'}</span></div>
    <div><span class="label">超限告警数：</span><span class="value"><b style="color:${record.alerts.length > 0 ? '#FF4D4F' : '#52c41a'};">${record.alerts.length} 条</b></span></div>
    <div><span class="label">阈值配置：</span><span class="value">已同步保存（见下 Excel 版详细配置）</span></div>
  </div>

  <!-- 第 2 章：设备信息 -->
  <h2 class="section">二、设备 & APP 信息</h2>
  <h3 class="subtitle">2.1 被测设备</h3>
  <div class="info-grid">
    <div><span class="label">设备型号：</span><span class="value">${record.deviceInfo.model || '-'}</span></div>
    <div><span class="label">品牌厂商：</span><span class="value">${record.deviceInfo.brand || '-'}</span></div>
    <div><span class="label">系统版本：</span><span class="value">${record.deviceInfo.systemVersion || '-'}</span></div>
    <div><span class="label">设备序列号：</span><span class="value">${record.deviceInfo.serialNumber || '-'}</span></div>
    <div><span class="label">总内存容量：</span><span class="value">${record.deviceInfo.memoryTotal ? `${record.deviceInfo.memoryTotal} MB` : '-'}</span></div>
    <div><span class="label">当前电量：</span><span class="value">${(record.deviceInfo as any).batteryLevel != null ? `${(record.deviceInfo as any).batteryLevel}%` : '-'}</span></div>
  </div>

  <h3 class="subtitle">2.2 被测 APP</h3>
  <div class="info-grid">
    <div><span class="label">APP 名称：</span><span class="value"><b>${record.appInfo.appName || '-'}</b></span></div>
    <div><span class="label">包名：</span><span class="value"><code>${record.appInfo.packageName || '-'}</code></span></div>
    <div><span class="label">版本号(VersionName)：</span><span class="value">${record.appInfo.versionName || '-'}</span></div>
    <div><span class="label">版本码(VersionCode)：</span><span class="value">${(record.appInfo as any).versionCode || '-'}</span></div>
  </div>

  <!-- 第 3 章：性能 KPI 汇总 -->
  <div class="page-break"></div>
  <h2 class="section">三、核心性能指标汇总（颜色分级）</h2>
  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-title">CPU 均值</div>
      <div class="kpi-value" style="color:${cpuColor};">${cpuAvg.toFixed(1)}%</div>
      <div class="kpi-extra">峰值：${cpuPeak}%<br/>阈值：${t.cpu.appCpuUsage}%<br/>状态：<b style="color:${cpuColor};">${cpuStatus}</b></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">内存均值</div>
      <div class="kpi-value" style="color:${memColor};">${memAvg} MB</div>
      <div class="kpi-extra">峰值：${memPeak} MB<br/>阈值：${t.memory.peakPhysicalMemory} MB<br/>状态：<b style="color:${memColor};">${memStatus}</b></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">平均 FPS</div>
      <div class="kpi-value" style="color:${fpsColor};">${avgFps.toFixed(1)}</div>
      <div class="kpi-extra">最低 FPS：${minFps}<br/>阈值：≥ ${t.gpu.minFps}<br/>状态：<b style="color:${fpsColor};">${fpsStatus}</b></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">累计耗电</div>
      <div class="kpi-value" style="color:#FAAD14;">${battConsume}%</div>
      <div class="kpi-extra">使用效率：${battEff}%<br/>常规阈值：≤ ${t.battery.normalPowerPerMin}%/min</div>
    </div>
  </div>

  <!-- 颜色分级说明 -->
  <div class="info-grid" style="margin-top:14px; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
    <div><span class="label" style="width:auto;"><span class="status-tag" style="background:#F6FFED;color:#389E0D;border:1px solid #B7EB8F;">🟢 正常</span></span><span class="value" style="padding-left:12px;">未超过阈值</span></div>
    <div><span class="label" style="width:auto;"><span class="status-tag" style="background:#FFFBE6;color:#D46B08;border:1px solid #FFD591;">🟡 临界</span></span><span class="value" style="padding-left:12px;">超过阈值 < 10%</span></div>
    <div><span class="label" style="width:auto;"><span class="status-tag" style="background:#FFF1F0;color:#CF1322;border:1px solid #FFA39E;">🔴 超限</span></span><span class="value" style="padding-left:12px;">超过阈值 ≥ 10%</span></div>
  </div>

  <!-- 第 4 章：告警汇总 -->
  <h2 class="section">四、阈值超限告警汇总</h2>
  ${alertRowsHtml}

  <!-- 第 5 章：备注 -->
  <div class="page-break"></div>
  <h2 class="section">五、备注与后续建议</h2>
  <div class="info-grid" style="grid-template-columns: 1fr; gap: 6px;">
    <div><span class="label" style="width:150px;">报告校验：</span><span class="value">本报告为系统自动生成，所有数值均通过 ADB 从真机实时采集，未经人工修改。</span></div>
    <div><span class="label" style="width:150px;">补充说明：</span><span class="value">① 采样间隔以「开始监控」时设置为准；② FPS/GPU 对国产 ROM 需开启开发者选项中的「GPU 呈现模式分析」；③ 耗电数据基于电量百分比估算，实际功耗建议结合专业功率计测量。</span></div>
    <div><span class="label" style="width:150px;">其他导出：</span><span class="value">如需多 Sheet 明细数据 / 会议 PPT 汇报，请在「历史记录」Tab 选择导出 Excel(.xlsx) 或 PPT(.pptx) 格式。</span></div>
  </div>

  <div style="margin-top:60px; text-align:center; color:#BFBFBF; font-size:12px; padding-top:20px; border-top:1px dashed #E8E8E8;">
    — APP性能大师 · APP Performance Master · <a href="mailto:support@app-master.local" style="color:#91D5FF; text-decoration:none;">support@app-master.local</a> —
  </div>

</body>
</html>`;

      // ---------- 调用 Electron 离屏窗口 + printToPDF 生成 PDF ----------
      win = new BrowserWindowCtor({
        show: false,
        width: 794,           // A4 @ 96dpi 宽度
        height: 1123,         // A4 @ 96dpi 高度
        webPreferences: {
          offscreen: true,    // ⭐ 离屏渲染，不占用 Dock/菜单栏
          sandbox: false,     // 需要 data:text/html 直接加载
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: false  // 允许 data: scheme 内部引用
        }
      });

      const htmlDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      await win!.loadURL(htmlDataUrl);

      // 等待字体加载和页面完全渲染（离屏模式 did-finish-load 后再等 200ms 更稳妥）
      await new Promise((r) => setTimeout(r, 220));

      const pdfBuf: Buffer = await win!.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0.4, bottom: 0.4, left: 0.2, right: 0.2 },
        preferCSSPageSize: true,
        displayHeaderFooter: false
      });

      const finalPath = savePath.endsWith('.pdf') ? savePath : savePath + '.pdf';
      await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
      await fs.promises.writeFile(finalPath, pdfBuf);

      win!.destroy();
      win = null;
      return finalPath;
    } catch (e: any) {
      if (win && !win.isDestroyed()) { try { win.destroy(); } catch (_) {} }
      console.error('[exportPdf] PDF导出失败:', e);
      throw new Error('PDF导出失败: ' + (e?.message || String(e)));
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        }
      : { r: 0, g: 0, b: 0 };
  }

  // ============== PPT 导出 ==============
  private async exportPpt(record: TestRecord, savePath: string): Promise<string | null> {
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.title = `APP性能测试报告_${record.appInfo.appName}`;
      pptx.subject = 'APP Performance Test Report';
      pptx.author = '手机APP检测监控软件';

      // ---------- 第1页：封面 ----------
      const slide1 = pptx.addSlide();
      slide1.background = { color: '1890FF' };
      slide1.addText('APP Performance Test Report', {
        x: 0.5, y: 1.5, w: '90%',
        fontSize: 44,
        color: 'FFFFFF',
        bold: true,
        align: 'center'
      });
      slide1.addText(`APP: ${record.appInfo.appName} (v${record.appInfo.versionName || '-'})`, {
        x: 0.5, y: 2.8, w: '90%',
        fontSize: 20,
        color: 'E6F7FF',
        align: 'center'
      });
      slide1.addText(`Device: ${record.deviceInfo.model} | ${record.deviceInfo.systemVersion}`, {
        x: 0.5, y: 3.5, w: '90%',
        fontSize: 18,
        color: 'BAE7FF',
        align: 'center'
      });
      slide1.addText(`Report Generated: ${this.formatDate(Date.now())}`, {
        x: 0.5, y: 4.5, w: '90%',
        fontSize: 14,
        color: '91D5FF',
        align: 'center'
      });

      // ---------- 第2页：测试概览 ----------
      const slide2 = pptx.addSlide();
      slide2.addText('Test Overview', { x: 0.5, y: 0.3, fontSize: 30, color: '1890FF', bold: true });

      const duration = record.endTime ? Math.round((record.endTime - record.startTime) / 1000) : 0;
      // 构造 PPTX 兼容的 Table 数据，所有单元格转为 TableCell 类型
      const summaryData: any = [
        [
          { text: 'Test Time', options: { bold: true, fill: { color: 'F0F5FF' } } },
          { text: 'Duration', options: { bold: true, fill: { color: 'F0F5FF' } } },
          { text: 'Status', options: { bold: true, fill: { color: 'F0F5FF' } } },
          { text: 'Alerts', options: { bold: true, fill: { color: 'F0F5FF' } } }
        ],
        [
          { text: this.formatDate(record.startTime) },
          { text: `${duration}s` },
          { text: record.status === 'completed' ? 'Completed' : 'Interrupted' },
          { text: record.alerts.length.toString() }
        ]
      ];
      slide2.addTable(summaryData, {
        x: 0.5, y: 1.2, w: 12,
        fontSize: 14,
        border: { type: 'solid', pt: 1, color: 'D9D9D9' },
        autoPage: true
      });

      // 设备和APP信息卡片（使用字符串形式的形状名，绕过类型检查）
      const ROUND_RECT = 'roundRect' as any;
      slide2.addShape(ROUND_RECT, {
        x: 0.5, y: 3, w: 5.8, h: 2.5,
        fill: { color: 'F6FFED' },
        line: { color: 'B7EB8F', pt: 1 }
      });
      slide2.addText('Device Info', { x: 0.8, y: 3.15, fontSize: 16, color: '389E0D', bold: true });
      slide2.addText(
        [
          { text: `Model: ${record.deviceInfo.model}\n`, options: { fontSize: 12 } },
          { text: `Brand: ${record.deviceInfo.brand || '-'}\n`, options: { fontSize: 12 } },
          { text: `System: ${record.deviceInfo.systemVersion}\n`, options: { fontSize: 12 } },
          { text: `Serial: ${record.deviceInfo.serialNumber}`, options: { fontSize: 12 } }
        ],
        { x: 0.8, y: 3.55, w: 5.2 }
      );

      slide2.addShape(ROUND_RECT, {
        x: 6.7, y: 3, w: 5.8, h: 2.5,
        fill: { color: 'E6F7FF' },
        line: { color: '91D5FF', pt: 1 }
      });
      slide2.addText('Application Info', { x: 7, y: 3.15, fontSize: 16, color: '0050B3', bold: true });
      slide2.addText(
        [
          { text: `Name: ${record.appInfo.appName}\n`, options: { fontSize: 12 } },
          { text: `Package: ${record.appInfo.packageName}\n`, options: { fontSize: 12 } },
          { text: `Version: ${record.appInfo.versionName || '-'}\n`, options: { fontSize: 12 } },
          { text: `VersionCode: ${record.appInfo.versionCode}`, options: { fontSize: 12 } }
        ],
        { x: 7, y: 3.55, w: 5.2 }
      );

      // ---------- 第3页：性能核心指标 ----------
      const slide3 = pptx.addSlide();
      slide3.addText('Key Performance Indicators', { x: 0.5, y: 0.3, fontSize: 28, color: '722ED1', bold: true });

      // 4个KPI卡片
      const addKpi = (x: number, y: number, title: string, value: string, threshold: string, color: string, bad: boolean) => {
        slide3.addShape(ROUND_RECT, {
          x, y, w: 2.8, h: 2.2,
          fill: { color: bad ? 'FFF1F0' : 'F6FFED' },
          line: { color: bad ? 'FFA39E' : 'B7EB8F', pt: 1 }
        });
        slide3.addText(title, { x, y: y + 0.15, w: 2.8, fontSize: 13, color, align: 'center', bold: true });
        slide3.addText(value, { x, y: y + 0.75, w: 2.8, fontSize: 28, color: bad ? 'CF1322' : '389E0D', align: 'center', bold: true });
        slide3.addText(`Threshold: ${threshold}`, { x, y: y + 1.7, w: 2.8, fontSize: 11, color: '#888888', align: 'center' });
      };

      const t = record.thresholdConfig;
      let cpuPeak = 0, cpuAvg = 0, memPeak = 0, memAvg = 0, avgFps = 0, battConsume = 0;

      if (record.cpuData.length > 0) {
        cpuPeak = Math.max(...record.cpuData.map((d) => d.appCpuUsage));
        cpuAvg = +(record.cpuData.reduce((s, d) => s + d.appCpuUsage, 0) / record.cpuData.length).toFixed(1);
      }
      if (record.memoryData.length > 0) {
        memPeak = Math.max(...record.memoryData.map((d) => d.physicalMemory));
        memAvg = Math.round(record.memoryData.reduce((s, d) => s + d.physicalMemory, 0) / record.memoryData.length);
      }
      if (record.gpuData.length > 0) {
        const fpsArr = record.gpuData.map((d) => d.fps).filter((f) => f > 0);
        if (fpsArr.length > 0) avgFps = +(fpsArr.reduce((a, b) => a + b, 0) / fpsArr.length).toFixed(1);
      }
      if (record.batteryData.length > 0) {
        battConsume = record.batteryData[record.batteryData.length - 1].totalPowerConsumption;
      }

      addKpi(0.5, 1, 'CPU Peak', `${cpuPeak}%`, `${t.cpu.appCpuUsage}%`, 'FA8C16', cpuPeak > t.cpu.appCpuUsage);
      addKpi(3.6, 1, 'CPU Avg', `${cpuAvg}%`, `${t.cpu.appCpuUsage}%`, 'FA8C16', cpuAvg > t.cpu.appCpuUsage);
      addKpi(6.7, 1, 'Memory Peak', `${memPeak}MB`, `${t.memory.peakPhysicalMemory}MB`, '13C2C2', memPeak > t.memory.peakPhysicalMemory);
      addKpi(9.8, 1, 'Memory Avg', `${memAvg}MB`, `${t.memory.peakPhysicalMemory}MB`, '13C2C2', memAvg > t.memory.peakPhysicalMemory);

      addKpi(0.5, 3.5, 'Avg FPS', `${avgFps}`, `${t.gpu.minFps}+ FPS`, 'EB2F96', avgFps > 0 && avgFps < t.gpu.minFps);
      addKpi(3.6, 3.5, 'Battery Used', `${battConsume}%`, `<${t.battery.normalPowerPerMin}/min`, '52C41A', false);
      addKpi(6.7, 3.5, 'Alert Count', record.alerts.length.toString(), '0', 'FF4D4F', record.alerts.length > 0);
      addKpi(9.8, 3.5, 'Duration', `${duration}s`, '-', '722ED1', false);

      // ---------- 第4页：告警汇总 ----------
      if (record.alerts.length > 0) {
        const slide4 = pptx.addSlide();
        slide4.addText('Threshold Alerts Summary', { x: 0.5, y: 0.3, fontSize: 28, color: 'FF4D4F', bold: true });

        const typeMap: Record<string, string> = {
          cpu: 'CPU', battery: 'BATTERY', memory: 'MEMORY', gpu: 'GPU',
          coldStart: 'COLD_START', hotStart: 'HOT_START'
        };

        const rows: any[] = [
          [
            { text: '#', options: { bold: true, fill: { color: 'FF4D4F' }, color: 'FFFFFF' } },
            { text: 'Type', options: { bold: true, fill: { color: 'FF4D4F' }, color: 'FFFFFF' } },
            { text: 'Metric', options: { bold: true, fill: { color: 'FF4D4F' }, color: 'FFFFFF' } },
            { text: 'Value', options: { bold: true, fill: { color: 'FF4D4F' }, color: 'FFFFFF' } },
            { text: 'Threshold', options: { bold: true, fill: { color: 'FF4D4F' }, color: 'FFFFFF' } },
            { text: 'Severity', options: { bold: true, fill: { color: 'FF4D4F' }, color: 'FFFFFF' } },
            { text: 'Time', options: { bold: true, fill: { color: 'FF4D4F' }, color: 'FFFFFF' } }
          ]
        ];

        record.alerts.slice(0, 20).forEach((a: ThresholdAlert, i: number) => {
          const fillColor = a.severity === 'critical' ? 'FFF1F0' : 'FFFBE6';
          const textColor = a.severity === 'critical' ? 'CF1322' : 'D46B08';
          rows.push([
            (i + 1).toString(),
            typeMap[a.type] || a.type,
            a.metric,
            a.value.toString(),
            a.threshold.toString(),
            { text: a.severity === 'critical' ? 'CRITICAL' : 'WARNING', options: { bold: true, color: textColor } },
            this.formatDate(a.startTime)
          ].map((cell: any) => {
            if (typeof cell === 'object') return cell;
            return { text: cell, options: { fill: { color: fillColor } } };
          }));
        });

        slide4.addTable(rows, {
          x: 0.5, y: 1, w: 12,
          fontSize: 11,
          border: { type: 'solid', pt: 0.5, color: 'FFCCC7' },
          autoPage: true
        });

        if (record.alerts.length > 20) {
          slide4.addText(`... and ${record.alerts.length - 20} more alerts (see full report)`, {
            x: 0.5, y: 6.5, fontSize: 12, color: '999999', italic: true
          });
        }
      }

      // ---------- 最后一页：感谢页 ----------
      const lastSlide = pptx.addSlide();
      lastSlide.background = { color: 'F0F5FF' };
      lastSlide.addText('Thanks', {
        x: 0.5, y: 2, w: '90%',
        fontSize: 54,
        color: '1890FF',
        bold: true,
        align: 'center'
      });
      lastSlide.addText('Generated by Mobile APP Monitor Software', {
        x: 0.5, y: 3.5, w: '90%',
        fontSize: 16,
        color: '8C8C8C',
        align: 'center'
      });

      const finalPath = savePath.endsWith('.pptx') ? savePath : savePath + '.pptx';
      await pptx.writeFile({ fileName: finalPath });
      return finalPath;
    } catch (e: any) {
      console.error('PPT导出失败:', e);
      throw new Error('PPT导出失败: ' + e.message);
    }
  }
}
