const path = require('path');

module.exports = {
  target: 'electron-main',
  entry: {
    main: './src/main/index.ts',
    preload: './src/main/preload.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  },
  externals: {
    fsevents: "require('fsevents')",
    // ⭐⭐⭐ 强制 electron 走运行时 require（而不是 webpack 打包源码）
    // 避免主进程任何模块（如 ReportExportService.exportPdf 内部 new BrowserWindow）
    // 顶层 import {BrowserWindow} from 'electron' 时被 webpack 误打包为 electron 源码导致运行失败
    electron: "require('electron')"
  }
};
