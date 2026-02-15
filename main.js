const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, Notification, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store');

// AutoUpdater Logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // User must explicitly download

process.on('uncaughtException', (err) => {
  dialog.showErrorBox('Fatal Error (Uncaught)', err.stack || err.toString());
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  dialog.showErrorBox('Fatal Error (Unhandled Promise)', String(reason));
  app.quit();
});

let store;

let settingsWindow = null;
let tray = null;
let backupIntervalId = null;
let isBackingUp = false;
let consecutiveSameSizeCount = 0;
let lastBackupSize = -1;

// Helper to send logs to renderer
function sendLog(message) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('log-message', `[${new Date().toLocaleTimeString()}] ${message}`);
  }
  log.info(message);
}

// Helper to update status
function sendStatus(isRunning) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('status-update', isRunning);
  }
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 800,
    height: 700,
    show: false, // Hidden by default
    frame: false, // Frameless for custom clean UI
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile('index.html');

  // Prevent closing, hide instead
  settingsWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      settingsWindow.hide();
    }
    return false;
  });
}

function createTray() {
  const trayIcon = nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setTitle(" Backup"); // Add a text title so it's visible in the tray even without an icon

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings', click: () => settingsWindow.show() },
    { type: 'separator' },
    {
      label: 'Exit', click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Nexus Smart Backup System');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (settingsWindow.isVisible()) {
      settingsWindow.hide();
    } else {
      settingsWindow.show();
    }
  });
}

// Recursive size calculation
async function getDirSize(dir) {
  let size = 0;
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        size += await getDirSize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (err) {
    log.error('Error calculating size:', err);
  }
  return size;
}

async function performBackup() {
  if (isBackingUp) return;
  isBackingUp = true;
  sendStatus(true);
  sendLog('Starting backup...');

  const source = store.get('source');
  const destination = store.get('destination');
  const rawExcludes = store.get('excludes') || '';
  const excludes = rawExcludes.split(',').map(s => s.trim()).filter(s => s);
  const maxBackups = store.get('maxBackups');
  const smartStreak = store.get('smartStreak');

  if (!source || !destination) {
    sendLog('Error: Source or Destination not set.');
    isBackingUp = false;
    sendStatus(!!backupIntervalId);
    return;
  }

  // Verify paths exist
  if (!fs.existsSync(source)) {
    sendLog('Error: Source path does not exist.');
    isBackingUp = false;
    return;
  }

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const backupFolderName = `Backup_${timestamp}`;
    const backupPath = path.join(destination, backupFolderName);

    // Copy with filter
    await fs.copy(source, backupPath, {
      filter: (src) => {
        const relative = path.relative(source, src);
        if (!relative) return true; // root folder of the source itself

        // Split path into segments using the platform-specific separator
        const segments = relative.split(path.sep);

        // Check if ANY segment in the path exactly matches one of the excluded tags
        // This prevents partial matches (e.g. excluding "temp" won't block "templates")
        // but ensures deep exclusion (e.g. "node_modules" blocks it at any depth)
        const isExcluded = segments.some(segment => excludes.includes(segment));

        return !isExcluded;
      }
    });

    sendLog(`Backup created at: ${backupPath}`);

    // Smart Check
    const currentSize = await getDirSize(backupPath);
    sendLog(`Backup size: ${currentSize} bytes`);

    if (currentSize === lastBackupSize) {
      consecutiveSameSizeCount++;
      sendLog(`Same size streak: ${consecutiveSameSizeCount}/${smartStreak}`);
      if (consecutiveSameSizeCount >= smartStreak) {
        sendLog('Smart Check Triggered: Stopping auto-backups.');
        stopBackupLoop();

        if (Notification.isSupported()) {
          new Notification({ title: 'Nexus Backup', body: 'Backup stopped due to inactivity (Smart Check).' }).show();
        }
      }
    } else {
      consecutiveSameSizeCount = 0;
      lastBackupSize = currentSize;
    }

    // Prune old backups
    await pruneBackups(destination, maxBackups);

  } catch (err) {
    sendLog(`Backup failed: ${err.message}`);
    log.error(err);
  } finally {
    isBackingUp = false;
    // status is only 'Running' if the loop is active
  }
}

async function pruneBackups(destDir, max) {
  try {
    const files = await fs.readdir(destDir);
    // Filter for backup folders and sort by creation time (name)
    // Assuming Backup-YYYY-MM-DD... format sort works chronologically
    const backupFolders = files.filter(f => f.startsWith('Backup_')).sort();

    if (backupFolders.length > max) {
      const toDelete = backupFolders.slice(0, backupFolders.length - max);
      for (const folder of toDelete) {
        const deletePath = path.join(destDir, folder);
        await fs.remove(deletePath);
        sendLog(`Pruned old backup: ${folder}`);
      }
    }
  } catch (err) {
    sendLog(`Pruning failed: ${err.message}`);
  }
}

function startBackupLoop() {
  if (backupIntervalId) clearInterval(backupIntervalId);

  const intervalMins = store.get('interval') || 60;
  sendLog(`Starting auto-backup. Interval: ${intervalMins} mins.`);

  backupIntervalId = setInterval(() => {
    performBackup();
  }, intervalMins * 60 * 1000);

  sendStatus(true);
}

function stopBackupLoop() {
  if (backupIntervalId) {
    clearInterval(backupIntervalId);
    backupIntervalId = null;
    sendLog('Auto-backup stopped.');
    sendStatus(false);
  }
}

// IPC Handlers
ipcMain.handle('get-settings', () => store.store);
ipcMain.handle('save-settings', (event, settings) => {
  store.set(settings);
  sendLog('Settings saved.');

  if (Notification.isSupported()) {
    new Notification({
      title: 'Configuration Saved',
      body: 'Your settings have been updated.'
    }).show();
  }

  // If running, restart loop with new interval logic
  if (backupIntervalId) {
    startBackupLoop();
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(settingsWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.on('start-backup', () => startBackupLoop());
ipcMain.on('stop-backup', () => stopBackupLoop());
ipcMain.on('force-backup', () => performBackup());
ipcMain.on('minimize-window', () => settingsWindow.hide());

// --- Auto Updater IPC & Events ---

ipcMain.on('check-for-update', () => {
  // Ensure we are in a "packaged" environment before checking for updates
  if (!app.isPackaged) {
    sendLog('AutoUpdater: App is not packaged (Dev Mode). Skipping update check.');
    return;
  }

  // NUCLEAR FIX: Force the update configuration to bypass app-update.yml
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'mmhassanin',
      repo: 'Nexus-Smart-Backup'
    });

    autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('AutoUpdater Crash Prevented:', error);
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('update-status', {
        status: 'error',
        error: 'Update check failed. Check your network.'
      });
    }
  }
});

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

// Forward events to renderer
autoUpdater.on('checking-for-update', () => {
  settingsWindow.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  settingsWindow.webContents.send('update-status', { status: 'available', info });
});

autoUpdater.on('update-not-available', (info) => {
  settingsWindow.webContents.send('update-status', { status: 'not-available', info });
});

autoUpdater.on('error', (err) => {
  settingsWindow.webContents.send('update-status', { status: 'error', error: err.toString() });
});

autoUpdater.on('download-progress', (progressObj) => {
  settingsWindow.webContents.send('update-status', { status: 'downloading', progress: progressObj });
});

autoUpdater.on('update-downloaded', (info) => {
  settingsWindow.webContents.send('update-status', { status: 'downloaded', info });
});


app.whenReady().then(() => {
  if (Notification.isSupported()) {
    new Notification({
      title: 'Nexus Smart Backup',
      body: 'System is now active and monitoring your files.'
    }).show();
  }

  try {
    store = new Store({
      defaults: {
        source: 'D:\\projects\\experimental-projects\\nexus-prime',
        destination: 'D:\\projects\\experimental-projects\\nexus-prime-backups',
        excludes: 'node_modules, .git, temp',
        interval: 60, // minutes
        maxBackups: 10,
        smartStreak: 3,
        autoStart: false
      }
    });

    // Ensure defaults are active if current settings are empty (e.g. from previous run)
    if (!store.get('source')) {
      store.set('source', 'D:\\projects\\experimental-projects\\nexus-prime');
    }
    if (!store.get('destination')) {
      store.set('destination', 'D:\\projects\\experimental-projects\\nexus-prime-backups');
    }

    createSettingsWindow();
    createTray();

    if (store.get('autoStart')) {
      startBackupLoop();
    }
  } catch (error) {
    dialog.showErrorBox('Startup Error', error.stack);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Do nothing, keep running in tray
});
