import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles/index.less';

// ⭐⭐⭐ 修复打包后骨架屏卡死 #1：React 根渲染 try-catch
// 如果 App 组件里任何一个模块（store / 组件 / 第三方库）在模块加载阶段或首次渲染阶段抛错，
// root.render 会直接 throw，导致 #root 永远是空节点 → boot-loading 永远显示。
// 这里 catch 后直接在 #root 渲染红色崩溃面板 + 错误堆栈，用户不用开 DevTools 就能看清楚哪里崩了
const tryRender = () => {
  try {
    const root = ReactDOM.createRoot(document.getElementById('root')!);
    root.render(
      <React.StrictMode>
        <ConfigProvider
          locale={zhCN}
          theme={{
            token: {
              colorPrimary: '#1677ff',
              colorInfo: '#1677ff',
              colorSuccess: '#52c41a',
              colorWarning: '#faad14',
              colorError: '#ff4d4f',
              borderRadius: 6,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
            }
          }}
        >
          <AntdApp>
            <App />
          </AntdApp>
        </ConfigProvider>
      </React.StrictMode>
    );
  } catch (err: any) {
    const rootEl = document.getElementById('root');
    if (!rootEl) return;
    console.error('[Renderer FATAL] React 根组件渲染崩溃:', err);
    rootEl.innerHTML = `
      <div style="position:fixed;inset:0;background:#fff1f0;z-index:2147483647;padding:40px;overflow:auto;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
        <h1 style="color:#cf1322;margin:0 0 16px;font-size:24px;">💥 渲染端崩溃（React 未能挂载到 #root）</h1>
        <p style="color:#595959;margin:0 0 20px;">以下是具体的错误堆栈，请截图发给开发排查。常见根因：①缺少 process/buffer polyfill ② preload.js 未挂载 window.electronAPI ③某个组件 import 阶段抛错</p>
        <div style="background:#fff;border:1px solid #ffa39e;border-radius:8px;padding:20px;">
          <p style="margin:0 0 8px;font-weight:700;color:#a8071a;">错误信息：</p>
          <pre style="margin:0 0 16px;white-space:pre-wrap;word-break:break-all;color:#000;font-size:13px;background:#fff7e6;padding:12px;border-radius:4px;">${(err?.message || String(err)).replace(/</g, '&lt;')}</pre>
          <p style="margin:0 0 8px;font-weight:700;color:#a8071a;">堆栈：</p>
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;color:#595959;font-size:12px;background:#fafafa;padding:12px;border-radius:4px;">${(err?.stack || '(无堆栈)').replace(/</g, '&lt;')}</pre>
        </div>
        <p style="margin-top:24px;color:#595959;font-size:13px;">👉 主进程日志：<code>~/Library/Application Support/AppPerformanceMaster/main.log</code></p>
      </div>
    `;
    // 崩溃面板显示了，强制隐藏骨架屏
    const boot = document.getElementById('boot-loading');
    if (boot) boot.style.display = 'none';
  }
};

// ⭐⭐⭐ 修复打包后骨架屏卡死 #2：如果 React 根渲染本身成功，但是在 React 事件系统/微任务里抛 Uncaught Error，
// 同样会导致 #root 有外层 DOM 但内容没渲染出来？（其实 StrictMode 不会清 #root，但以防万一）
window.addEventListener('error', (e) => {
  try {
    console.error('[UNCAUGHT RENDERER ERROR]', (e.error && e.error.stack) || e.message, e.filename + ':' + e.lineno);
  } catch (_) {}
});
window.addEventListener('unhandledrejection', (e) => {
  try {
    console.error('[UNHANDLED RENDERER REJECTION]', e.reason && (e.reason.stack || e.reason.message) || String(e.reason));
  } catch (_) {}
});

tryRender();
