import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AdbManager } from './services/AdbManager';
import { MonitorService } from './services/MonitorService';
import { StorageService } from './services/StorageService';
import { ReportExportService } from './services/ReportExportService';
import { IpcChannel, DEFAULT_THRESHOLDS } from '../shared/types';
import type {
  DeviceInfo,
  AppInfo,
  ThresholdConfig,
  MonitorConfig,
  ColdStartData,
  HotStartData,
  ExportConfig,
  TestRecord,
  MonitorDataPackage
} from '../shared/types';

// ==================== 第一优先级：崩溃日志捕获（必须放在一切业务代码之前） ====================
// Electron 如果遇到未捕获异常会直接 SIGTRAP 退出，异常堆栈会丢失。
// 下面的钩子把崩溃细节写到 /tmp/app-master-crash.log，便于定位。
const CRASH_LOG = process.platform === 'win32'
  ? path.join(process.env.TEMP || process.cwd(), 'app-master-crash.log')
  : '/tmp/app-master-crash.log';
try { fs.unlinkSync(CRASH_LOG); } catch (_) { /* ignore */ }
const writeCrash = (tag: string, err: any, origin?: string) => {
  try {
    const info = [
      `\n========== ${tag} @ ${new Date().toISOString()} ==========`,
      origin ? `[origin] ${origin}` : '',
      err instanceof Error ? `[stack]\n${err.stack}` : `[raw] ${String(err)}`,
      ''
    ].filter(Boolean).join('\n');
    fs.appendFileSync(CRASH_LOG, info, 'utf-8');
    // eslint-disable-next-line no-console
    console.error(`[Main][${tag}]`, err && err.stack ? err.stack : err);
  } catch (_) { /* ignore */ }
};
process.on('uncaughtException', (err, origin) => writeCrash('uncaughtException', err, origin));
process.on('unhandledRejection', (reason, promise) => writeCrash('unhandledRejection', reason, String(promise)));

// ⭐⭐⭐ 生产模式下（打包后双击 .app/.exe），控制台日志写入 userData/main.log
// 因为双击打开没有终端，用户看不到 console，白屏时只能看日志定位
let userMainLogPath = '';
const patchConsoleToFile = () => {
  try {
    const logDir = app.getPath('userData');
    userMainLogPath = path.join(logDir, 'main.log');
    try { fs.unlinkSync(userMainLogPath); } catch (_) { /* ignore */ }
    const append = (level: string, args: any[]) => {
      try {
        const line = `[${new Date().toISOString()}][${level}] ${args.map(a => (a instanceof Error ? a.stack : (typeof a === 'string' ? a : JSON.stringify(a, null, 0)))).join(' ')}\n`;
        fs.appendFileSync(userMainLogPath, line, 'utf8');
      } catch (_) { /* ignore */ }
    };
    const _origError = console.error.bind(console);
    const _origWarn = console.warn.bind(console);
    const _origLog = console.log.bind(console);
    console.error = (...a: any[]) => { _origError(...a); append('ERROR', a); };
    console.warn = (...a: any[]) => { _origWarn(...a); append('WARN', a); };
    console.log = (...a: any[]) => { _origLog(...a); append('INFO', a); };
    console.info = (...a: any[]) => { _origLog(...a); append('INFO', a); };
  } catch (_) { /* ignore */ }
};

// ==================== 应用全局配置 ====================
// 软件名称与ID（统一修改处）
const APP_NAME = 'APP性能大师';
const APP_ID = 'com.appmaster.performance.monitor';
// 应用图标路径：开发时读取 resources/icons/app-icon.svg，打包后读 asar 内置
const getAppIcon = (): Electron.NativeImage | undefined => {
  try {
    const iconCandidates = [
      path.resolve(__dirname, '../../resources/icons/app-icon.svg'), // dev: dist/main/ → resources
      path.resolve(process.resourcesPath, 'icons/app-icon.svg')      // prod: asar/resources
    ];
    for (const p of iconCandidates) {
      if (fs.existsSync(p)) return nativeImage.createFromPath(p);
    }
    // 兜底：内联 SVG dataURL（无文件也能显示品牌图标）
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 512 512"><rect width="512" height="512" rx="110" fill="#1677FF"/><rect x="164" y="104" width="184" height="320" rx="28" fill="#fff" stroke="#003A8C" stroke-width="4"/><rect x="178" y="124" width="156" height="260" rx="8" fill="#001529"/><rect x="202" y="254" width="22" height="60" fill="#52C41A"/><rect x="236" y="224" width="22" height="90" fill="#1677FF"/><rect x="270" y="244" width="22" height="70" fill="#FAAD14"/><rect x="304" y="214" width="22" height="100" fill="#F5222D"/></svg>`;
    return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallbackSvg)}`);
  } catch {
    return undefined;
  }
};
// 设置应用级元信息（⚠️ 必须在 app.whenReady 之后调用，否则 macOS 会报 'Failed to get userData path'）
// 关键设计：userData 必须使用英文路径（沙箱环境禁止写入中文目录名 ~/Library/Application Support/APP性能大师/）
//          否则 Chromium 写入 LocalStorage/SessionStorage 时会被 Trae Sandbox 拦截触发 SIGTRAP 崩溃
//          做法：先 app.setPath('userData', 英文路径) 强制 userData 走英文，再 app.setName(中文) 做UI显示
const USER_DATA_DIR_EN = 'AppPerformanceMaster'; // 英文，沙箱安全
const applyAppMeta = () => {
  // ① 优先强制 userData 使用英文路径（必须在 setName 之前）
  try {
    const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
    let enUserDir: string;
    if (process.platform === 'darwin') {
      enUserDir = path.join(home, 'Library', 'Application Support', USER_DATA_DIR_EN);
    } else if (process.platform === 'win32') {
      enUserDir = path.join(process.env.APPDATA || home, USER_DATA_DIR_EN);
    } else {
      enUserDir = path.join(home, '.config', USER_DATA_DIR_EN);
    }
    // 确保目录存在（否则 setPath 可能失败）
    try { fs.mkdirSync(enUserDir, { recursive: true }); } catch (_) { /* ignore */ }
    app.setPath('userData', enUserDir);
    console.log('[Main] ✅ userData 英文安全路径:', app.getPath('userData'));
  } catch (e) {
    console.warn('[Main] setPath(userData) 英文路径失败，回退默认，路径:',
      (() => { try { return app.getPath('userData'); } catch { return 'N/A'; } })(),
      (e as Error).message);
  }

  // ② 再设置 UI 显示的中文应用名（Dock/任务栏/关于面板显示"APP性能大师"，不再影响userData路径）
  try { app.setName(APP_NAME); } catch (e) { console.warn('[Main] app.setName 失败（忽略）:', (e as Error).message); }

  // ③ macOS Dock 菜单名 / Windows 任务栏分组ID
  try {
    if (process.platform === 'win32') {
      app.setAppUserModelId(APP_ID);
    } else if (process.platform === 'darwin') {
      try { app.setAboutPanelOptions({ applicationName: APP_NAME, applicationVersion: app.getVersion() }); } catch (_) {}
      process.title = APP_NAME;
    }
  } catch (e) { console.warn('[Main] setAppUserModelId/AboutPanel 失败（忽略）:', (e as Error).message); }
};

let mainWindow: BrowserWindow | null = null;
// ⚠️ 服务实例必须延迟到 app.whenReady() 后创建（见上面注释）。
// ! 断言：所有 ipcMain 事件都在 whenReady() 内注册，handler 执行时服务一定已初始化。
let adbManager!: AdbManager;
let monitorService!: MonitorService;
let storageService!: StorageService;
let reportExportService!: ReportExportService;

// 存储当前阈值配置
let currentThresholds: ThresholdConfig = { ...DEFAULT_THRESHOLDS };

// 渲染进程加载失败时显示的兜底 HTML（避免纯白屏，一眼看出是加载问题）
const buildFallbackHtml = (title: string, desc: string, detail?: string): string => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"/><title>${APP_NAME}</title>
<style>
html,body{height:100%;margin:0;padding:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f7fa;color:#1f1f1f}
.wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:40px}
.card{max-width:520px;background:#fff;border-radius:12px;padding:40px 44px;box-shadow:0 4px 20px rgba(22,119,255,.12);text-align:center}
.logo{width:80px;height:80px;margin:0 auto 20px;border-radius:20px;background:linear-gradient(135deg,#1677FF,#722ED1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:34px;font-weight:800}
h1{font-size:22px;margin:0 0 10px;color:#0f172a}
.desc{font-size:14px;color:#52525b;line-height:1.7;margin:14px 0 24px}
.tag{display:inline-block;padding:4px 12px;border-radius:999px;background:#fff1f0;color:#cf1322;font-size:12px;margin-bottom:16px}
.detail{background:#fafafa;border:1px solid #f0f0f0;padding:12px;border-radius:8px;font-family:Consolas,monospace;font-size:12px;color:#4b5563;text-align:left;white-space:pre-wrap;word-break:break-all;max-height:180px;overflow:auto;margin-top:10px}
.btn{display:inline-block;margin-top:20px;padding:8px 22px;background:#1677FF;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer}
.btn:hover{background:#0958d9}
</style></head>
<body><div class="wrap"><div class="card">
<div class="logo">AP</div>
<div class="tag">${title}</div>
<h1>${APP_NAME}</h1>
<div class="desc">${desc}</div>
${detail ? `<div class="detail">${detail.replace(/</g,'&lt;')}</div>` : ''}
<button class="btn" onclick="location.reload()">🔄 重新加载</button>
</div></div></body></html>`;

function createWindow() {
  // ⭐⭐⭐ 修复打包后白屏 #1：用 app.isPackaged 判断开发/生产，不再依赖 NODE_ENV 环境变量
  // 打包后 isPackaged = true，开发模式 = false，永远不会误判
  const isDev = !app.isPackaged;

  // ⭐⭐⭐ 修复打包后白屏 #2：用 app.getAppPath() 拼接绝对路径，不依赖 webpack __dirname
  // 开发模式 getAppPath() = project root；生产模式 = app.asar 根目录
  const APP_ROOT = app.getAppPath();
  const PRELOAD_PATH = path.join(APP_ROOT, 'dist', 'main', 'preload.js');
  const RENDERER_INDEX = path.join(APP_ROOT, 'dist', 'renderer', 'index.html');
  try {
    console.log(`[Main] 路径诊断：APP_ROOT=${APP_ROOT}`);
    console.log(`[Main] 路径诊断：PRELOAD_PATH=${PRELOAD_PATH}  exists=${fs.existsSync(PRELOAD_PATH)}`);
    console.log(`[Main] 路径诊断：RENDERER_INDEX=${RENDERER_INDEX}  exists=${fs.existsSync(RENDERER_INDEX)}`);
  } catch (_) { /* ignore */ }

  const appIcon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 768,
    backgroundColor: '#f5f7fa',
    webPreferences: {
      preload: PRELOAD_PATH,                 // ⭐ 修复打包后找不到 preload.js
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: APP_NAME,
    icon: appIcon,
    show: false,                       // 先隐藏，等 ready-to-show 或 兜底超时
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    useContentSize: true,
    acceptFirstMouse: true
  });

  // 设置 Dock 图标（macOS）
  if (process.platform === 'darwin' && appIcon) {
    app.dock?.setIcon(appIcon);
  }

  // 【白屏修复 #1】兜底超时：无论 ready-to-show 是否触发，2.5 秒后强制显示窗口
  // （防止首次 webpack 编译慢 / ready-to-show 永不触发导致的"有进程无界面"）
  const forceShowTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.warn('[Main] ready-to-show 未在 2.5s 内触发，兜底强制显示窗口');
      mainWindow.showInactive();
    }
  }, 2500);
  mainWindow.once('ready-to-show', () => {
    clearTimeout(forceShowTimer);
    mainWindow?.show();
  });

  // 【白屏修复 #2】did-fail-load：页面加载失败时，渲染原生兜底错误页（再也不是纯白）
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedUrl, _isMain, _frame) => {
    console.error('[Main] 渲染进程加载失败', { errorCode, errorDesc, validatedUrl });
    if (!mainWindow) return;
    const isNet = errorCode === -102 || errorCode === -105 || errorCode === -111 || errorCode === -502 || validatedUrl.includes('localhost:3000');
    const title = isNet ? '开发服务未就绪' : '页面加载失败';
    let desc = isNet
      ? `正在尝试连接开发服务器：<b>${validatedUrl}</b><br/>如果长时间显示此页，请检查：<br/>① npm run dev 的 webpack-dev-server 是否启动成功（默认端口 3000）<br/>② 防火墙/代理是否阻止本地回环访问 127.0.0.1`
      : `渲染进程加载出错，错误码 ${errorCode}。您可以点下方按钮重试，或检查日志定位问题。`;
    // ⭐⭐⭐ 修复打包后白屏 #4：生产模式加载失败时，把路径诊断、日志路径直接显示在兜底页上
    if (!isDev) {
      try {
        const appPath = app.getAppPath();
        const userData = app.getPath('userData');
        const prodInfo = [
          '<hr style="margin:18px 0;border:0;border-top:1px dashed #ddd"/>',
          '<h3 style="color:#d4380d;font-size:15px;">🚑 打包版本诊断信息</h3>',
          `<p><b>运行模式：</b>生产打包版 (isPackaged=true)</p>`,
          `<p><b>APP安装目录(app.getAppPath)：</b><code>${appPath}</code></p>`,
          `<p><b>预加载脚本存在：</b>${fs.existsSync(PRELOAD_PATH) ? '✅ ' + PRELOAD_PATH : '❌ 缺失: ' + PRELOAD_PATH}</p>`,
          `<p><b>渲染页面存在：</b>${fs.existsSync(RENDERER_INDEX) ? '✅ ' + RENDERER_INDEX : '❌ 缺失: ' + RENDERER_INDEX}</p>`,
          `<p><b>主进程日志文件：</b><code>${userMainLogPath || path.join(userData, 'main.log')}</code></p>`,
          `<p><b>崩溃日志文件：</b><code>${CRASH_LOG}</code></p>`,
          '<p style="color:#52525b;font-size:13px;">👉 请打开上面的日志文件，查看 [ERROR] 开头的具体报错，再联系开发排查。</p>'
        ].join('');
        desc = desc + prodInfo;
      } catch (_diag) { /* ignore */ }
    }
    const tip = isDev
      ? `[${errorCode}] ${errorDesc}\nURL: ${validatedUrl}\n\n💡 小提示：首次运行 npm run dev 时，webpack 需要约 5~15 秒编译，页面会自动刷新。`
      : `[${errorCode}] ${errorDesc}\nURL: ${validatedUrl}\nAPP_ROOT=${(() => { try { return app.getAppPath(); } catch { return 'N/A'; } })()}\nuserData=${(() => { try { return app.getPath('userData'); } catch { return 'N/A'; } })()}`;
    const html = buildFallbackHtml(title, desc, tip);
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    clearTimeout(forceShowTimer);
    mainWindow.showInactive();
  });

  // 【白屏修复 #3】渲染进程崩溃 / GPU 崩溃：显示友好崩溃页
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (!mainWindow) return;
    const html = buildFallbackHtml('渲染进程异常退出', `渲染进程已退出（原因：${details.reason}），已为您保留窗口，点击下方按钮即可恢复。点击下方按钮或关闭后重新打开 APP。`, JSON.stringify(details, null, 2));
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    mainWindow.showInactive();
  });

  // 【白屏修复 #4】控制台转发渲染进程的所有console（error/warn/info/log/debug全打印，方便定位"骨架屏一直显示"这种React没挂载的问题）
  mainWindow.webContents.on('console-message', (_e, level, msg, line, sourceId) => {
    const tag = ['[Renderer LOG]', '[Renderer LOG]', '[Renderer WARN]', '[Renderer ERROR]'][level] || `[Renderer L${level}]`;
    const loc = sourceId ? ` (${sourceId.split('/').pop()}:${line})` : '';
    const out = `${tag}${loc} ${msg}`;
    if (level === 3) console.error(out); else if (level === 2) console.warn(out); else console.log(out);
  });
  // 渲染端未捕获异常 / Promise rejection（这两种常导致React首屏渲染中断，骨架屏消不掉）
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) return;
    mainWindow.webContents.executeJavaScript(`
      window.addEventListener('error', function(e) {
        console.error('[UNCAUGHT]', (e.error && e.error.stack) || e.message || e, 'at', e.filename + ':' + e.lineno);
      });
      window.addEventListener('unhandledrejection', function(e) {
        console.error('[UNHANDLED REJECTION]', e.reason && (e.reason.stack || e.reason.message) || String(e.reason));
      });
      // 如果 30 秒后 boot-loading 还存在，说明React挂载可能失败，强制显示错误信息帮用户排查
      setTimeout(function() {
        var boot = document.getElementById('boot-loading');
        if (boot && boot.style.display !== 'none') {
          var root = document.getElementById('root');
          var err = document.createElement('div');
          err.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.96);z-index:99999;padding:40px;font-family:-apple-system,sans-serif;color:#000;font-size:14px;';
          err.innerHTML = '<h2 style=\"color:#d4380d;margin-bottom:12px;\">⚠️ 前端挂载超时（React未能在30秒内渲染成功）</h2>' +
            '<p><b>请在 DevTools 控制台查看具体错误原因</b></p>' +
            '<p>常见原因：① webpack 打包后的 JS 加载失败 ② 运行时错误（查看 [Renderer ERROR] 日志） ③ 模块依赖缺失</p>' +
            '<pre style=\"background:#fff1f0;padding:16px;border:1px solid #ffa39e;overflow:auto;white-space:pre-wrap;\">' +
              'root 元素: ' + (root ? (root.children ? root.children.length : 0) + ' 个子节点, innerHTML[:500] = ' + root.innerHTML.slice(0, 500) : 'NOT FOUND') +
            '</pre>' +
            '<p style=\"color:#666;margin-top:20px;\"><i>提示：本提示不会影响打包版本，仅开发模式下用于诊断。</i></p>';
          document.body.appendChild(err);
        }
      }, 30000);
    `).catch(() => {});
  });

  // 【开发模式】自动打开 DevTools（右侧抽屉，用户可直接看 Console / Network 诊断）
  if (isDev) {
    mainWindow.webContents.once('did-finish-load', () => {
      try { mainWindow!.webContents.openDevTools({ mode: 'detach' }); } catch (_) {}
    });
  }

  // 开始实际加载内容（开发模式：自动探测 webpack-dev-server 实际端口，避免端口冲突后白屏/无法连接）
  if (isDev) {
    // 自动探测逻辑：环境变量 > /tmp/.app-master-devport 文件 > 默认端口轮询
    const probeDevPort = async (): Promise<number> => {
      // ===== ⭐⭐⭐ Issue1 修复：整个函数外层 try-catch，任何 unhandled 异常都兜底返回 3000，
      // 避免 os/path/fs/http/require 同步/异步异常穿透为 UnhandledRejection 让页面永远停在骨架屏 =====
      try {
        const os = require('os') as typeof import('os');
        const portFile = path.join(os.tmpdir(), '.app-master-devport');
        // ① 读取环境变量（cross-env 设置）
        if (process.env.DEV_PORT) {
          const n = Number(process.env.DEV_PORT);
          if (Number.isFinite(n) && n > 0 && n < 65536) return n;
        }
        if (process.env.DEV_URL) {
          const m = process.env.DEV_URL.match(/:(\d+)/);
          if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > 0 && n < 65536) return n;
          }
        }
        // ② 读取 devServer 写入的临时文件（webpack.renderer.config.js 写入）
        for (let i = 0; i < 30; i++) {
          try {
            if (fs.existsSync(portFile)) {
              const raw = await fs.promises.readFile(portFile, 'utf8');
              const p = parseInt(raw.trim(), 10);
              if (Number.isFinite(p) && p > 0 && p < 65536) return p;
            }
          } catch (_) { /* ignore single iteration */ }
          try {
            await new Promise((r) => setTimeout(r, 400));
          } catch (_) { /* ignore */ }
        }
        // ③ 兜底：3000~3009 逐个 HTTP 探测 /__devport__ 接口
        const http = require('http') as typeof import('http');
        const portsToProbe = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009];
        for (const p of portsToProbe) {
          try {
            const ok: boolean = await new Promise<boolean>((resolve) => {
              try {
                // ===== ⭐ Issue1 内层修复：Promise 构造内部再 try-catch，
                // 避免 http.request 同步抛错（如参数非法、模块加载异常）虽会被 Promise 自动包装为 reject，
                // 但内层 resolve(false) 更快、减少一次 reject→catch 穿透 =====
                const req = http.request(
                  { hostname: '127.0.0.1', port: p, path: '/__devport__', timeout: 300, method: 'GET' },
                  (res) => {
                    try { resolve(res.statusCode === 200); } catch (_) { resolve(false); }
                    try { res.resume(); } catch (_) { /* ignore */ }
                  }
                );
                req.on('timeout', () => { try { req.destroy(); } catch (_) {} resolve(false); });
                req.on('error', () => resolve(false));
                req.end();
              } catch (_) {
                resolve(false);
              }
            });
            if (ok) return p;
          } catch (_) {
            /* 单个端口探测任何异常都忽略，继续下一个，绝对不中断整个 for 循环 */
          }
        }
        return 3000; // 实在找不到就 3000，交给 did-fail-load 显示兜底页
      } catch (_outer) {
        // 任何未预料的异常（os/path/fs/http 模块缺失、内存不足、权限拒绝等）
        console.warn('[probeDevPort] 探测过程异常，兜底用3000端口:', _outer);
        return 3000;
      }
    };

    const showLoading = () => {
      // webpack 编译期间先展示骨架加载页，避免用户看到纯白，也避免过早触发 did-fail-load
      const loadingHtml = buildFallbackHtml(
        '正在初始化开发环境',
        '前端代码正在编译（首次约 5~15 秒），编译完成后本页会<b>自动跳转</b>到主界面。<br/>如果长时间停留此页，请检查控制台 webpack 是否有编译错误。',
        `[TIP] 若超过 30 秒未跳转：请确认端口 3000~3009 之间有 webpack-dev-server 运行；可手动执行 curl http://127.0.0.1:3000/__devport__ 检查。`
      );
      mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);
    };
    showLoading();

    probeDevPort().then((port) => {
      const DEV_URL = `http://127.0.0.1:${port}`;
      console.log(`[Main] 开发模式：已探测到 Webpack Dev Server @ ${DEV_URL}`);
      mainWindow?.loadURL(DEV_URL);
      // 附着式 DevTools（bottom），detach 容易被误关找不到
      mainWindow?.webContents.openDevTools({ mode: 'bottom' });
    }).catch((err) => {
      console.error('[Main] 开发服务器端口探测失败：', err);
    });
  } else {
    // ⭐⭐⭐ 修复打包后白屏 #3：用 app.getAppPath() 拼好的 RENDERER_INDEX 加载，不再依赖 __dirname
    console.log(`[Main] 生产模式：加载渲染页 ${RENDERER_INDEX} (exists=${fs.existsSync(RENDERER_INDEX)})`);
    mainWindow.loadFile(RENDERER_INDEX).catch((e) => {
      console.error('[Main] 生产模式 loadFile 异常：', e?.stack || e);
    });
  }

  // 打开外部链接用系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    clearTimeout(forceShowTimer);
    mainWindow = null;
    monitorService.stopAllMonitoring();
  });
}

// ============== IPC 事件注册 ==============

// 设备相关
ipcMain.handle(IpcChannel.SCAN_DEVICES, async (): Promise<DeviceInfo[]> => {
  try {
    const devices = await adbManager.scanDevices();
    // 广播设备更新
    mainWindow?.webContents.send(IpcChannel.DEVICES_UPDATED, devices);
    return devices;
  } catch (error: any) {
    sendError('扫描设备失败: ' + error.message);
    return [];
  }
});

ipcMain.handle(IpcChannel.GET_DEVICES, async (): Promise<DeviceInfo[]> => {
  return adbManager.getCachedDevices();
});

ipcMain.handle(IpcChannel.GET_ADB_DIAGNOSTICS, async () => {
  return adbManager.getDiagnostics();
});

ipcMain.handle(IpcChannel.CONNECT_DEVICE, async (_event, deviceId: string): Promise<boolean> => {
  try {
    return await adbManager.connectDevice(deviceId);
  } catch (error: any) {
    sendError('连接设备失败: ' + error.message);
    return false;
  }
});

ipcMain.handle(IpcChannel.DISCONNECT_DEVICE, async (_event, deviceId: string): Promise<boolean> => {
  try {
    // 断开前先停止该设备的监控
    monitorService.stopMonitoring(deviceId);
    return await adbManager.disconnectDevice(deviceId);
  } catch (error: any) {
    sendError('断开设备失败: ' + error.message);
    return false;
  }
});

// APP相关
ipcMain.handle(IpcChannel.GET_INSTALLED_APPS, async (_event, deviceId: string): Promise<AppInfo[]> => {
  try {
    return await adbManager.getInstalledApps(deviceId);
  } catch (error: any) {
    sendError('获取应用列表失败: ' + error.message);
    return [];
  }
});

ipcMain.handle(IpcChannel.DEBUG_APP_LIST, async (_event, deviceId: string) => {
  try {
    return await adbManager.debugAppList(deviceId);
  } catch (error: any) {
    sendError('应用列表诊断失败: ' + error.message);
    throw error;
  }
});

ipcMain.handle(IpcChannel.INSTALL_APK, async (_event, deviceId: string, apkPath: string): Promise<boolean> => {
  try {
    return await adbManager.installApk(deviceId, apkPath);
  } catch (error: any) {
    sendError('安装APK失败: ' + error.message);
    return false;
  }
});

ipcMain.handle(IpcChannel.UNINSTALL_APP, async (_event, deviceId: string, packageName: string): Promise<boolean> => {
  try {
    return await adbManager.uninstallApp(deviceId, packageName);
  } catch (error: any) {
    sendError('卸载APP失败: ' + error.message);
    return false;
  }
});

ipcMain.handle(IpcChannel.LAUNCH_APP, async (_event, deviceId: string, packageName: string): Promise<boolean> => {
  try {
    return await adbManager.launchApp(deviceId, packageName);
  } catch (error: any) {
    sendError('启动APP失败: ' + error.message);
    return false;
  }
});

ipcMain.handle(IpcChannel.FORCE_STOP_APP, async (_event, deviceId: string, packageName: string): Promise<boolean> => {
  try {
    return await adbManager.forceStopApp(deviceId, packageName);
  } catch (error: any) {
    sendError('停止APP失败: ' + error.message);
    return false;
  }
});

ipcMain.handle(IpcChannel.CLEAR_APP_DATA, async (_event, deviceId: string, packageName: string): Promise<boolean> => {
  try {
    return await adbManager.clearAppData(deviceId, packageName);
  } catch (error: any) {
    sendError('清除APP数据失败: ' + error.message);
    return false;
  }
});

// 监控相关
// ⭐ 全局只注册一次（不要再在 START_MONITOR 每次都 push，callbacks 会越来越多）
const _registerMonitorCallbacksOnce = () => {
  if (typeof monitorService === 'undefined') return;
  monitorService.onData((deviceId, data) => {
    if (mainWindow) {
      mainWindow.webContents.send(IpcChannel.MONITOR_DATA_UPDATED, deviceId, data);
    }
  });

  monitorService.onAlert((alert) => {
    if (mainWindow) {
      mainWindow.webContents.send(IpcChannel.ALERT_OCCURRED, alert);
    }
  });

  // ⭐ 因设备离线/采集失败的自动停止：存 record → 通知前端 → 前端改状态+弹Toast
  monitorService.onAutoStopped(async (deviceId, reason, message, record) => {
    try {
      if (record) {
        await storageService?.saveTestRecord(record);
      }
    } catch (e) {
      console.error('[AutoStop] 保存自动停止的测试记录失败:', (e as Error).message);
    }
    if (mainWindow) {
      mainWindow.webContents.send(
        IpcChannel.MONITOR_AUTO_STOPPED,
        deviceId,
        reason,
        message,
        record?.id ?? null
      );
    }
  });
};

ipcMain.handle(
  IpcChannel.START_MONITOR,
  async (_event, config: MonitorConfig): Promise<boolean> => {
    try {
      return await monitorService.startMonitoring(config, currentThresholds);
    } catch (error: any) {
      sendError('启动监控失败: ' + error.message);
      return false;
    }
  }
);

ipcMain.handle(IpcChannel.STOP_MONITOR, async (_event, deviceId: string): Promise<TestRecord | null> => {
  try {
    const record = await monitorService.stopMonitoring(deviceId);
    if (record) {
      await storageService.saveTestRecord(record);
    }
    return record;
  } catch (error: any) {
    sendError('停止监控失败: ' + error.message);
    return null;
  }
});

ipcMain.handle(IpcChannel.PAUSE_MONITOR, (_event, deviceId: string): boolean => {
  return monitorService.pauseMonitoring(deviceId);
});

ipcMain.handle(IpcChannel.RESUME_MONITOR, (_event, deviceId: string): boolean => {
  return monitorService.resumeMonitoring(deviceId);
});

ipcMain.handle(IpcChannel.CLEAR_MONITOR_DATA, (_event, deviceId: string): boolean => {
  return monitorService.clearData(deviceId);
});

// 启动测试
ipcMain.handle(
  IpcChannel.START_COLD_TEST,
  async (
    _event,
    deviceId: string,
    apkPath: string,
    packageName: string,
    trafficConfig?: { networkThreshold: number; initialTraffic: number }
  ): Promise<ColdStartData | null> => {
    try {
      const result = await monitorService.runColdStartTest(
        deviceId,
        apkPath,
        packageName,
        currentThresholds.coldStart,
        trafficConfig
      );
      return result;
    } catch (error: any) {
      sendError('冷启动测试失败: ' + error.message);
      return null;
    }
  }
);

ipcMain.handle(
  IpcChannel.START_HOT_TEST,
  async (_event, deviceId: string, packageName: string): Promise<HotStartData | null> => {
    try {
      const result = await monitorService.runHotStartTest(
        deviceId,
        packageName,
        currentThresholds.hotStart
      );
      return result;
    } catch (error: any) {
      sendError('热启动测试失败: ' + error.message);
      return null;
    }
  }
);

// 阈值配置
ipcMain.handle(IpcChannel.GET_THRESHOLDS, (): ThresholdConfig => {
  return { ...currentThresholds };
});

ipcMain.handle(IpcChannel.UPDATE_THRESHOLDS, (_event, config: Partial<ThresholdConfig>): ThresholdConfig => {
  currentThresholds = {
    ...currentThresholds,
    ...config,
    cpu: { ...currentThresholds.cpu, ...config.cpu },
    battery: { ...currentThresholds.battery, ...config.battery },
    memory: { ...currentThresholds.memory, ...config.memory },
    gpu: { ...currentThresholds.gpu, ...config.gpu },
    coldStart: { ...currentThresholds.coldStart, ...config.coldStart },
    hotStart: { ...currentThresholds.hotStart, ...config.hotStart }
  };
  storageService.saveThresholds(currentThresholds);
  return { ...currentThresholds };
});

ipcMain.handle(IpcChannel.RESET_THRESHOLDS, (): ThresholdConfig => {
  currentThresholds = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
  storageService.saveThresholds(currentThresholds);
  return { ...currentThresholds };
});

// 历史记录
ipcMain.handle(IpcChannel.GET_HISTORY_RECORDS, async (): Promise<TestRecord[]> => {
  return storageService.getTestRecords();
});

ipcMain.handle(IpcChannel.DELETE_HISTORY_RECORD, async (_event, recordId: string): Promise<boolean> => {
  return storageService.deleteTestRecord(recordId);
});

// 报告导出
ipcMain.handle(
  IpcChannel.EXPORT_REPORT,
  async (_event, config: ExportConfig): Promise<string | null> => {
    try {
      return await reportExportService.exportReport(config);
    } catch (error: any) {
      sendError('导出报告失败: ' + error.message);
      return null;
    }
  }
);

// 文件选择
ipcMain.handle(IpcChannel.SELECT_APK_FILE, async (): Promise<string | null> => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择APK安装包',
    filters: [{ name: 'Android APK', extensions: ['apk'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle(
  IpcChannel.SELECT_SAVE_PATH,
  async (_event, defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存文件',
      defaultPath: defaultName,
      filters
    });
    if (result.canceled) return null;
    return result.filePath;
  }
);

function sendError(message: string) {
  if (mainWindow) {
    mainWindow.webContents.send(IpcChannel.ERROR, { message, timestamp: Date.now() });
  }
}

// App生命周期
app.whenReady().then(() => {
  // 【关键①】先设置应用名称/ID，再实例化服务/创建窗口（避免userData路径获取失败）
  applyAppMeta();

  // ⭐⭐⭐ 生产模式日志落盘（applyAppMeta 之后才能 getPath('userData')）
  if (app.isPackaged) patchConsoleToFile();
  console.log(`[Main] ================ APP启动 ================`);
  console.log(`[Main] app.isPackaged=${app.isPackaged}  NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}  app.getAppPath()=${app.getAppPath()}`);
  console.log(`[Main] userData=${app.getPath('userData')}`);
  if (userMainLogPath) console.log(`[Main] 生产模式主进程日志: ${userMainLogPath}`);

  // 【关键②】Electron环境ready后，再实例化所有服务（此时app.getPath、系统权限100%安全）
  try {
    adbManager = new AdbManager();
    storageService = new StorageService();
    monitorService = new MonitorService(adbManager);
    reportExportService = new ReportExportService(storageService);
    _registerMonitorCallbacksOnce();  // ⭐ 监控回调（data/alert/auto-stopped）全局只注册一次
  } catch (e) {
    console.error('[Main] 服务初始化失败（应用将尝试继续运行）:', (e as Error).message);
  }

  // 加载存储的配置
  const savedThresholds = storageService?.loadThresholds() ?? null;
  if (savedThresholds) {
    currentThresholds = savedThresholds;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // 定时扫描设备
  setInterval(async () => {
    try {
      const devices = await adbManager.scanDevices();
      if (mainWindow) {
        mainWindow.webContents.send(IpcChannel.DEVICES_UPDATED, devices);
      }
    } catch (e) {
      // 忽略定时扫描错误
    }
  }, 5000);
});

app.on('window-all-closed', () => {
  monitorService.stopAllMonitoring();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
