const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// ⭐⭐⭐ 打包后骨架屏卡死终极根因修复：isDev 必须双保险判断
// ① 只有 NODE_ENV 严格等于 development 才算开发
// ② 同时命令行必须是 webpack-dev-server / webpack serve 模式（否则 NODE_ENV 漏设就会误判）
// 这样即使漏了 cross-env 也能正确识别生产模式，避免 publicPath='/' → file:// 协议下 script src="/renderer.js" 404
const _argv = (process.argv || []).join(' ');
const isDevServer = /webpack(-dev-server|\s+serve)/.test(_argv);
const isDev = process.env.NODE_ENV === 'development' && isDevServer;

// 开发服务基础端口：优先读 DEV_PORT 环境变量，否则默认 3000
// 若端口被占用请先执行 `npm run killport` 清理
const DEV_PORT = Number(process.env.DEV_PORT || process.env.PORT || 3000);

module.exports = {
  // ⚠️ 必须用 'web' 而不是 'electron-renderer'！
  // 原因：本项目启用了 contextIsolation:true + nodeIntegration:false（Electron官方安全推荐），
  //       渲染进程是纯浏览器沙箱，没有 Node.js require。
  //       如果 target=electron-renderer，webpack 会把 Node 内置模块（events/path/util 等）
  //       标记为 external，代码里保留 require('events')，运行时直接 Uncaught ReferenceError: require is not defined → React 永不挂载 → 骨架屏卡死！
  target: 'web',
  // Webpack5 不再自动 polyfill Node.js 全局变量；浏览器环境需要 global 才能兼容 antd/chart 等历史库
  node: {
    global: true,
    __filename: false,
    __dirname: false
  },
  entry: './src/renderer/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'renderer.js',
    // 开发模式用 '/'（同源，避免页面从 127.0.0.1:3000 加载时，script src 却指向 localhost:3000 造成跨域或热更新ws连接失败）
    // 生产模式用空串（相对路径，等同于 './'），100% 兼容 file:// 协议（打包后直接 loadFile），
    // 最终注入 index.html 的 script src = "renderer.js"（无任何前缀，index.html 与 renderer.js 同目录，file协议直接找到）
    publicPath: isDev ? '/' : ''
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    // 【浏览器端 Node.js polyfill 兜底】target=web 时，如果某些第三方库依赖 Node 内置模块（events 最常见），
    // 这里显式指向浏览器 polyfill 实现，防止编译报错或运行时报 require is not defined
    fallback: {
      // ⭐⭐⭐ 打包后React崩溃根因之一：浏览器端没有 Node.js 内置模块，必须强制用 npm 安装的浏览器 polyfill
      // 不要用 Node.js 自带的 events/buffer（会带 Node-only API，打包后偶尔会出现内部引用）
      events: require.resolve('events/'),
      buffer: require.resolve('buffer/'),
      // process 浏览器端 polyfill（process/browser.js），antd/axios/dayjs/recharts 内部大量读取 process.env.NODE_ENV
      process: require.resolve('process/browser'),
      // 下面这些浏览器端基本不会用到，直接 false
      path: false,
      crypto: false,
      fs: false,
      os: false,
      stream: false,
      util: false,
      zlib: false,
      http: false,
      https: false,
      assert: false,
      querystring: false,
      url: false,
      string_decoder: false,
      punycode: false,
      timers: false,
      console: false,
      constants: false,
      vm: false,
      dns: false,
      dgram: false,
      child_process: false,
      cluster: false,
      module: false,
      net: false,
      readline: false,
      repl: false,
      tls: false
    },
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@': path.resolve(__dirname, 'src')
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      },
      {
        test: /\.less$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'less-loader',
            options: {
              lessOptions: {
                javascriptEnabled: true
              }
            }
          }
        ]
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg|ico|ttf|woff|woff2)$/,
        type: 'asset/resource',
        parser: {
          dataUrlCondition: {
            maxSize: 8 * 1024
          }
        }
      }
    ]
  },
  plugins: [
    // 浏览器端全局注入（target=web 没有 Node.js，Buffer/process 必须显式注入，否则第三方库炸）
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/renderer/index.html'),
      title: 'APP性能大师 - 手机APP性能检测与监控平台',
      inject: 'body',
      // ⭐⭐⭐ 双保险：显式告诉 HtmlWebpackPlugin 生产模式下不要加任何前缀，避免 "/renderer.js" 导致的 file 协议 404
      // webpack5 output.publicPath 有时会被后处理插件覆盖，这里在插件级别再锁一次
      publicPath: isDev ? '/' : ''
    }),
    new MiniCssExtractPlugin({
      filename: 'styles.css'
    })
  ],
  devServer: {
    port: DEV_PORT,
    host: '127.0.0.1',                                                 // 仅监听本地回环，安全 & 防防火墙弹窗
    historyApiFallback: true,
    hot: true,
    allowedHosts: 'all',
    client: {
      overlay: { errors: true, warnings: false, runtimeErrors: true }   // 编译错误直接覆盖在页面顶部，避免误以为白屏
    },
    static: [
      // 静态资源目录：resources（图标），publicPath=/__static__
      { directory: path.resolve(__dirname, 'resources'), publicPath: '/__static__', watch: false }
    ],
    setupMiddlewares: (middlewares, devServer) => {
      // 写入 devport 文件供 Electron 端读取（端口固定=DEV_PORT，更简单）
      devServer.app?.get('/__devport__', (_req, res) => {
        res.json({ ok: true, port: DEV_PORT, url: `http://127.0.0.1:${DEV_PORT}` });
      });
      devServer.compiler.hooks.done.tap('AppMaster-DevBootstrap', (stats) => {
        const fs = require('fs');
        try {
          fs.writeFileSync(require('path').join(require('os').tmpdir(), '.app-master-devport'), String(DEV_PORT), 'utf8');
        } catch (_) {}
        if (!stats.hasErrors()) {
          // eslint-disable-next-line no-console
          console.log(`\n\x1b[36m⚡ APP性能大师：前端编译成功 → http://127.0.0.1:${DEV_PORT} — Electron 窗口即将自动显示主界面。\x1b[0m\n`);
        } else {
          // eslint-disable-next-line no-console
          console.log(`\n\x1b[31m❌ 前端编译存在错误，请查看下方控制台或页面顶部红色覆盖层。\x1b[0m\n`);
        }
      });
      return middlewares;
    }
  }
};
