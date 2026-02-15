# Nexus Smart Backup System (Universal Edition)

**The Ultimate Standalone Backup Tool for Any Project**

Nexus Smart Backup System is a powerful, production-ready desktop application designed to keep your critical data safe. Originally built for Nexus Prime, it has been re-engineered as a universal tool that anyone can use to backup *any* folder to *any* destination with professional-grade reliability.

## 🌟 Key Features

### 🖥️ Modern Tabbed Interface
- **Dashboard**: Real-time system status, live logs, and quick controls (Start/Stop/Force Backup).
- **Configuration**: sleek, dark-mode settings panel with dynamic folder selection.

### 🛡️ Deep Exclusion System (Tag/Chip UI)
- **Smart Filtering**: Easily exclude clutter. Just type a folder name (e.g., `node_modules`, `.git`, `dist`) and press **Enter** to create a tag.
- **Deep Logic**: The system intelligently scans and ignores *any* folder or file matching your tags, no matter how deep it is nested in your project.

### ⚙️ Powerful Automation
- **Auto-Interval**: Set your desired backup frequency (in minutes).
- **Smart Streak**: Detects if files haven't changed after X backups and automatically pauses to save resources.
- **Auto-Rotation**: Keeps your backup folder clean by retaining only the last N backups (configurable).
- **System Tray Integration**: Runs silently in the background with a native tray icon.

## 🚀 Getting Started

1.  **Download/Build** the application.
2.  **Launch** `Nexus Smart Backup.exe`.
3.  **Go to Configuration**:
    -   **Source**: Click "Browse" to select the folder you want to protect.
    -   **Destination**: Click "Browse" to select where backups should go.
    -   **Exclusions**: Add tags for folders you want to skip (e.g., `node_modules`).
    -   **Auto-Start**: Check if you want it to run on Windows startup.
4.  **Save Settings** and click **Start Loop** on the Dashboard.

## 🛠️ Build from Source

Requirements: Node.js & NPM.

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode
npm start

# 3. Build standalone .exe
npm run build
# OR use the included batch script for a clean build:
Build-Backup.bat
```

## 📦 Tech Stack
- **Electron**: Cross-platform desktop framework.
- **Node.js**: Powerful backend runtime.
- **fs-extra**: Reliable file system operations.
- **Electron-Store**: Persistent configuration storage.

---
*Universal Standalone Backup Tool - crafted with ❤️*
