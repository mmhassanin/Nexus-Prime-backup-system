// DOM Elements
const el = (id) => document.getElementById(id);

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Inputs
const sourceInput = el('source');
const destInput = el('destination');
const excludesInput = el('excludesInput');
const excludesContainer = el('excludesContainer');
const intervalInput = el('interval');
const maxBackupsInput = el('maxBackups');
const smartStreakInput = el('smartStreak');
const autoStartCheckbox = el('autoStart');

// Status & Logs
const statusValue = el('statusValue');
const statusText = el('statusText');
const logsArea = el('logs');

// Updates Elements
const checkUpdatesBtn = el('checkUpdatesBtn');
const downloadUpdateBtn = el('downloadUpdateBtn');
const restartBtn = el('restartBtn');
const updateStatusText = el('updateStatusText');
const updateProgressContainer = el('updateProgressContainer');
const updateProgressBar = el('updateProgressBar');

// State for Tags
let excludedTags = [];

// Tab Switching Logic
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add to current
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        el(tabId).classList.add('active');
    });
});

// Tag/Chip System
function renderTags() {
    // Clear current tags (except the input)
    const existingTags = excludesContainer.querySelectorAll('.tag');
    existingTags.forEach(t => t.remove());

    // Re-add tags before the input
    excludedTags.forEach(tag => {
        const tagEl = document.createElement('div');
        tagEl.className = 'tag';
        tagEl.innerHTML = `
            ${tag}
            <span class="tag-close" data-tag="${tag}">&times;</span>
        `;
        excludesContainer.insertBefore(tagEl, excludesInput);
    });

    // Re-attach listeners to close buttons
    const closeBtns = excludesContainer.querySelectorAll('.tag-close');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tagToRemove = e.target.getAttribute('data-tag');
            excludedTags = excludedTags.filter(t => t !== tagToRemove);
            renderTags();
        });
    });
}

function addTag(tag) {
    const cleaned = tag.trim();
    if (cleaned && !excludedTags.includes(cleaned)) {
        excludedTags.push(cleaned);
        renderTags();
    }
    excludesInput.value = '';
}

excludesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addTag(excludesInput.value);
    }
    if (e.key === 'Backspace' && excludesInput.value === '' && excludedTags.length > 0) {
        // Remove last tag on backspace if input is empty
        excludedTags.pop();
        renderTags();
    }
});

// Focus container focuses input
excludesContainer.addEventListener('click', (e) => {
    if (e.target !== excludesInput && !e.target.classList.contains('tag-close')) {
        excludesInput.focus();
    }
});

// Load Settings
async function loadSettings() {
    const settings = await window.api.invoke('get-settings');
    sourceInput.value = settings.source || '';
    destInput.value = settings.destination || '';

    // Parse excludes string to array
    const rawExcludes = settings.excludes || '';
    excludedTags = rawExcludes.split(',').map(s => s.trim()).filter(s => s);
    renderTags();

    intervalInput.value = settings.interval || 60;
    maxBackupsInput.value = settings.maxBackups || 10;
    smartStreakInput.value = settings.smartStreak || 3;
    autoStartCheckbox.checked = settings.autoStart || false;
}

// Save Settings
async function saveSettings() {
    const settings = {
        source: sourceInput.value,
        destination: destInput.value,
        excludes: excludedTags.join(', '), // Join back to string for storage
        interval: parseInt(intervalInput.value),
        maxBackups: parseInt(maxBackupsInput.value),
        smartStreak: parseInt(smartStreakInput.value),
        autoStart: autoStartCheckbox.checked
    };
    await window.api.invoke('save-settings', settings);
}

// IPC & Event Listeners
el('browseSource').addEventListener('click', async () => {
    const path = await window.api.invoke('select-folder');
    if (path) sourceInput.value = path;
});

el('browseDest').addEventListener('click', async () => {
    const path = await window.api.invoke('select-folder');
    if (path) destInput.value = path;
});

el('saveBtn').addEventListener('click', async () => {
    await saveSettings();
    const originalText = el('saveBtn').innerText;
    el('saveBtn').innerText = 'Saved Successfully!';
    el('saveBtn').classList.add('success');
    // Assuming adding a success class helps but for now just text change is requested.

    setTimeout(() => {
        el('saveBtn').innerText = originalText;
        el('saveBtn').classList.remove('success');
    }, 2000);
});

el('startBtn').addEventListener('click', () => {
    window.api.send('start-backup');
});

el('stopBtn').addEventListener('click', () => {
    window.api.send('stop-backup');
});

el('forceBtn').addEventListener('click', () => {
    window.api.send('force-backup');
});

el('closeBtn').addEventListener('click', () => {
    window.api.send('minimize-window');
});

// Update Buttons
checkUpdatesBtn.addEventListener('click', () => {
    window.api.send('check-for-update');
    updateStatusText.innerText = 'Checking for updates...';
    checkUpdatesBtn.disabled = true;
});

downloadUpdateBtn.addEventListener('click', () => {
    window.api.send('download-update');
    downloadUpdateBtn.disabled = true;
});

restartBtn.addEventListener('click', () => {
    window.api.send('quit-and-install');
});

// Logs & Status
window.api.receive('log-message', (msg) => {
    logsArea.value += msg + '\n';
    logsArea.scrollTop = logsArea.scrollHeight;
});

window.api.receive('status-update', (isRunning) => {
    if (isRunning) {
        statusText.textContent = 'RUNNING';
        statusValue.className = 'status-value running';
    } else {
        statusText.textContent = 'STOPPED';
        statusValue.className = 'status-value stopped';
    }
});

// Update Status Listener
window.api.receive('update-status', (data) => {
    switch (data.status) {
        case 'checking':
            updateStatusText.innerText = 'Checking for updates...';
            break;
        case 'available':
            updateStatusText.innerText = `Update available: ${data.info.version}. Click Download to proceed.`;
            downloadUpdateBtn.style.display = 'inline-block';
            checkUpdatesBtn.style.display = 'none';
            break;
        case 'not-available':
            updateStatusText.innerText = 'You are on the latest version.';
            checkUpdatesBtn.disabled = false;
            break;
        case 'error':
            updateStatusText.innerText = `Error: ${data.error}`;
            checkUpdatesBtn.disabled = false;
            break;
        case 'downloading':
            updateProgressContainer.style.display = 'block';
            const percent = Math.round(data.progress.percent);
            updateProgressBar.style.width = percent + '%';
            updateStatusText.innerText = `Downloading... ${percent}%`;
            break;
        case 'downloaded':
            updateStatusText.innerText = 'Update downloaded. Restart to install.';
            updateProgressContainer.style.display = 'none';
            downloadUpdateBtn.style.display = 'none';
            restartBtn.style.display = 'inline-block';
            break;
    }
});

// Initial Load
loadSettings();
