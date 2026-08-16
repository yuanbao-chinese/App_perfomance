# 🎨 应用图标资源说明（APP性能大师）

本目录存放 Electron 桌面应用、安装包（electron-builder）打包所需的品牌图标资源。

## 📁 文件结构

```
resources/
└── icons/
    └── app-icon.svg      ✅ 主图标：矢量 SVG（建议作为唯一源头）
```

> **已内置品牌SVG图标**（512x512 蓝紫渐变 + 手机 + 柱状 + 波形，品牌色 #1677FF → #722ED1），
> macOS/Windows/Linux 三平台 Electron 均能直接读取 SVG 作为窗口/任务栏/Dock 图标。
> 主进程已做兜底：即使 SVG 文件缺失也会内联同色品牌图标 dataURL，**绝不显示默认 Electron 树叶图标**。

---

## 🔧 一键生成多格式图标（推荐）

如需给 Windows/Mac 安装包使用标准格式（.ico / .icns / 多尺寸 PNG），推荐使用 `electron-icon-maker` 或 `sharp-cli`
一键将本 SVG 转成所有尺寸：

```bash
cd <项目根目录>

# 方案 A：electron-icon-maker（专门用于electron打包图标）
npx electron-icon-maker --input=./resources/icons/app-icon.svg --output=./resources/icons

# 方案 B：sharp-cli（更灵活，支持任何格式互转）
npx --yes sharp-cli resources/icons/app-icon.svg \
    --resize 512 -o resources/icons/icon-512x512.png \
    --resize 256 -o resources/icons/icon-256x256.png \
    --resize 128 -o resources/icons/icon-128x128.png \
    --resize 64  -o resources/icons/icon-64x64.png   \
    --resize 32  -o resources/icons/icon-32x32.png   \
    --resize 16  -o resources/icons/icon-16x16.png
```

生成后的目录 `resources/icons` 会包含 electron-builder 自动识别的命名：
- macOS：`icon.icns`
- Windows：`icon.ico`
- Linux：`icon.png`（多尺寸）

---

## 🧩 替换为你自己的品牌 LOGO

### 方式 1：直接覆盖（最快）
把你自己的 SVG / PNG 图标直接覆盖 `app-icon.svg`，命名需保持一致即可。

### 方式 2：改路径自定义
编辑 `src/main/index.ts` 顶部的 `getAppIcon()` 函数，或直接修改 `package.json` 中
`build.mac.icon`、`build.win.icon`、`build.linux.icon` 三个字段指向你的图标文件。

### 方式 3：内联改品牌色
如果想保持本项目风格只改颜色，打开 `app-icon.svg` 修改 3 处即可：
- `<linearGradient id="bg">` → 背景渐变色
- `<linearGradient id="phone">` → 手机壳渐变
- 4 根柱状 `<rect>` 各自 `fill` 属性（绿/蓝/橙/红）

---

## 📦 图标尺寸标准（electron-builder 自动识别）

| 平台 | 文件 | 推荐尺寸 | 说明 |
|------|------|---------|------|
| **macOS** | `icon.icns` | 1024x1024（含多种尺寸） | 打包 dmg / App Store 提交均需 |
| **Windows** | `icon.ico` | 256x256（含 16/32/48/64/128/256） | NSIS安装包 + 任务栏 + 桌面快捷方式 |
| **Linux** | `icon.png`（或 SVG） | 512x512 | AppImage / deb / rpm |
| **通用(开发)** | `app-icon.svg` | 512x512 | 窗口左上角 / Dock / 任务栏 |

---

## 🎯 本项目图标自动加载优先级（已代码实现）

1. 优先读取打包产物内：`<App>/Contents/Resources/icons/app-icon.svg`（asar/resources）
2. 其次读取开发时路径：`<项目根>/resources/icons/app-icon.svg`
3. 兜底：内联 SVG `data:image/svg+xml;base64` 字符串写入内存（无文件也能显示 AP 品牌图标）

**因此即使误删 resources/icons/app-icon.svg，Electron 窗口也不会出现「树叶图标」或空白图标。**
