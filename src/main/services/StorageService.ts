import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { TestRecord, ThresholdConfig } from '../../shared/types';
import { DEFAULT_THRESHOLDS } from '../../shared/types';

/**
 * 本地存储服务 - 负责测试记录、阈值配置的持久化存储
 */
export class StorageService {
  private dataDir: string = '';
  private recordsFile: string = '';
  private thresholdsFile: string = '';
  /** 内存模式兜底（所有路径失败时启用，不影响UI启动） */
  private memStorage = false;
  private memRecords: TestRecord[] = [];
  private memThresholds: ThresholdConfig | null = null;

  constructor() {
    // ============== 策略：100% 保证可用，绝不因存储路径问题导致APP白屏/启动失败 ==============
    // 优先级（全部带 try/catch 兜底）：
    //   1. electron ready 后调用 app.getPath('userData') → 官方推荐、自带写权限
    //   2. 按系统规则拼接 userData 等效路径（英文目录避免中文权限问题）
    //   3. 最终兜底 /tmp/app-performance-master （Linux/macOS/Windows tmp 均 100% 可写）
    const candidates: string[] = [];
    try {
      if (app && typeof app.getPath === 'function') {
        candidates.push(path.join(app.getPath('userData'), 'storage')); // ① Electron自带userData子目录
      }
    } catch (_) { /* ignore */ }
    candidates.push(this.getDefaultDataDir()); // ② 手拼标准路径
    candidates.push(path.join('/tmp', '.app-performance-master-storage')); // ③ 终极兜底tmp
    candidates.push(path.join(process.cwd(), '.app-data-storage')); // ④ 项目目录兜底

    let success = false;
    for (const dir of candidates) {
      try {
        this.dataDir = dir;
        this.recordsFile = path.join(this.dataDir, 'test-records.json');
        this.thresholdsFile = path.join(this.dataDir, 'thresholds.json');
        this.initDir();
        // 写一个测试文件验证可写性
        const probeFile = path.join(this.dataDir, `.write-test-${Date.now()}`);
        fs.writeFileSync(probeFile, 'ok'); fs.unlinkSync(probeFile);
        success = true;
        break;
      } catch (e) {
        console.warn('[Storage] 候选存储路径初始化失败，尝试下一个：', dir, (e as Error).message);
      }
    }
    if (!success) {
      // 理论不会走到这里（/tmp或项目目录总有一个可写）；为了不阻塞启动，改用内存Map模拟
      console.warn('[Storage] 所有存储路径均失败，降级为「内存存储模式」（重启数据不保留）');
      this.memStorage = true;
    }
  }

  private getDefaultDataDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    const appDir = 'AppPerformanceMaster'; // 英文目录，避免中文跨平台权限/编码问题
    if (process.platform === 'darwin') {
      return path.join(home, 'Library/Application Support', appDir);
    } else if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || home, appDir);
    }
    return path.join(home, '.config', appDir);
  }

  private initDir() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (e) {
        console.error('创建数据目录失败:', e);
      }
    }
    if (!fs.existsSync(this.recordsFile)) {
      fs.writeFileSync(this.recordsFile, JSON.stringify([]), 'utf-8');
    }
  }

  private safeReadJson<T>(filePath: string, defaultValue: T): T {
    try {
      if (this.memStorage) {
        if (filePath === this.recordsFile) return (this.memRecords as unknown as T) || defaultValue;
        if (filePath === this.thresholdsFile) return (this.memThresholds as unknown as T) || defaultValue;
        return defaultValue;
      }
      if (!filePath || !fs.existsSync(filePath)) return defaultValue;
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (e) {
      console.error(`读取文件失败 ${filePath}:`, e);
      return defaultValue;
    }
  }

  private safeWriteJson(filePath: string, data: any) {
    try {
      if (this.memStorage) {
        if (filePath === this.recordsFile) this.memRecords = Array.isArray(data) ? data : [];
        if (filePath === this.thresholdsFile) this.memThresholds = data;
        return;
      }
      if (!filePath) return;
      const tmpFile = filePath + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, filePath);
    } catch (e) {
      console.error(`写入文件失败 ${filePath}:`, e);
    }
  }

  /**
   * 保存测试记录
   */
  async saveTestRecord(record: TestRecord): Promise<boolean> {
    const records = this.safeReadJson<TestRecord[]>(this.recordsFile, []);
    // 避免数据过大，保留最多100条记录
    const trimmed = records.slice(-99);
    trimmed.push(record);
    this.safeWriteJson(this.recordsFile, trimmed);
    return true;
  }

  /**
   * 获取所有测试记录
   */
  async getTestRecords(): Promise<TestRecord[]> {
    const records = this.safeReadJson<TestRecord[]>(this.recordsFile, []);
    // 按时间倒序返回
    return records.sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * 获取单条记录
   */
  async getTestRecordById(recordId: string): Promise<TestRecord | null> {
    const records = this.safeReadJson<TestRecord[]>(this.recordsFile, []);
    return records.find((r) => r.id === recordId) || null;
  }

  /**
   * 删除测试记录
   */
  async deleteTestRecord(recordId: string): Promise<boolean> {
    const records = this.safeReadJson<TestRecord[]>(this.recordsFile, []);
    const filtered = records.filter((r) => r.id !== recordId);
    if (filtered.length === records.length) return false;
    this.safeWriteJson(this.recordsFile, filtered);
    return true;
  }

  /**
   * 清除所有历史记录
   */
  async clearAllRecords(): Promise<boolean> {
    this.safeWriteJson(this.recordsFile, []);
    return true;
  }

  /**
   * 保存阈值配置
   */
  saveThresholds(config: ThresholdConfig): boolean {
    this.safeWriteJson(this.thresholdsFile, config);
    return true;
  }

  /**
   * 加载阈值配置
   */
  loadThresholds(): ThresholdConfig | null {
    if (!fs.existsSync(this.thresholdsFile)) return null;
    const saved = this.safeReadJson<ThresholdConfig | null>(this.thresholdsFile, null);
    if (!saved) return null;
    // 深度合并，保证新增字段有默认值
    return {
      cpu: { ...DEFAULT_THRESHOLDS.cpu, ...saved.cpu },
      battery: { ...DEFAULT_THRESHOLDS.battery, ...saved.battery },
      memory: { ...DEFAULT_THRESHOLDS.memory, ...saved.memory },
      gpu: { ...DEFAULT_THRESHOLDS.gpu, ...saved.gpu },
      coldStart: { ...DEFAULT_THRESHOLDS.coldStart, ...saved.coldStart },
      hotStart: { ...DEFAULT_THRESHOLDS.hotStart, ...saved.hotStart }
    };
  }

  /**
   * 搜索历史记录
   */
  async searchRecords(params: {
    deviceId?: string;
    packageName?: string;
    startTimeFrom?: number;
    startTimeTo?: number;
  }): Promise<TestRecord[]> {
    const records = await this.getTestRecords();
    return records.filter((r) => {
      if (params.deviceId && r.deviceId !== params.deviceId) return false;
      if (params.packageName && r.packageName !== params.packageName) return false;
      if (params.startTimeFrom && r.startTime < params.startTimeFrom) return false;
      if (params.startTimeTo && r.startTime > params.startTimeTo) return false;
      return true;
    });
  }

  getDataDir(): string {
    return this.dataDir;
  }
}
