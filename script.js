// Global variables
let currentFile = null;
let currentPassword = '';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeFileUpload();
    updateSystemInfo();
    setInterval(updateSystemInfo, 5000);
    setInterval(updateCurrentTime, 1000);
});

// File Upload Handling
function initializeFileUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    
    // Click to browse
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelection(file) {
    currentFile = file;
    
    const fileInfo = document.getElementById('file-info');
    const size = formatFileSize(file.size);
    
    fileInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
            <i class="fas fa-file" style="font-size: 2rem; color: var(--info-color);"></i>
            <div>
                <h4 style="margin-bottom: 0.25rem;">${file.name}</h4>
                <p style="color: var(--text-secondary); margin: 0;">Size: ${size}</p>
                <p style="color: var(--text-secondary); margin: 0;">Type: ${file.type || 'Unknown'}</p>
            </div>
        </div>
    `;
    
    showNotification(`File selected: ${file.name}`, 'success');
    addLogEntry('info', `File selected: ${file.name} (${size})`);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Tool Handling
async function handleTool(tool) {
    if (!currentFile) {
        showNotification('Please select a file first', 'error');
        return;
    }
    
    const button = document.querySelector(`[data-tool="${tool}"] .tool-btn`);
    const originalText = button.querySelector('.btn-text').textContent;
    
    // Show loading state
    button.classList.add('loading');
    button.disabled = true;
    
    try {
        const formData = new FormData();
        formData.append('file', currentFile);
        
        let response;
        
        switch(tool) {
            case 'encrypt':
                response = await fetch('/encrypt', {
                    method: 'POST',
                    body: formData
                });
                await handleFileDownload(response, `${currentFile.name}.encrypted`);
                break;
                
            case 'decrypt':
                response = await fetch('/decrypt', {
                    method: 'POST',
                    body: formData
                });
                await handleFileDownload(response, currentFile.name.replace('.encrypted', ''));
                break;
                
            case 'compute_hash':
                response = await fetch('/compute_hash', {
                    method: 'POST',
                    body: formData
                });
                await handleJsonResponse(response);
                break;
                
            case 'verify_integrity':
                response = await fetch('/verify_integrity', {
                    method: 'POST',
                    body: formData
                });
                await handleJsonResponse(response);
                break;
                
            case 'backup':
                response = await fetch('/backup', {
                    method: 'POST',
                    body: formData
                });
                await handleJsonResponse(response);
                break;
                
            case 'view_hashes':
                response = await fetch('/view_hashes');
                await handleJsonResponse(response);
                break;
                
            case 'system_info':
                response = await fetch('/system_info');
                await handleJsonResponse(response);
                break;
        }
        
    } catch (error) {
        console.error('Tool error:', error);
        showNotification('Operation failed: ' + error.message, 'error');
        addLogEntry('error', `${tool.replace('_', ' ')} failed: ${error.message}`);
    } finally {
        // Restore button state
        button.classList.remove('loading');
        button.disabled = false;
    }
}

async function handleFileDownload(response, filename) {
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showNotification('File downloaded successfully', 'success');
        addLogEntry('success', `File processed and downloaded: ${filename}`);
    } else {
        const error = await response.json();
        throw new Error(error.error || 'Unknown error');
    }
}

async function handleJsonResponse(response) {
    const data = await response.json();
    
    if (data.success) {
        showNotification('Operation completed successfully', 'success');
        
        // Handle different response types
        if (data.hash) {
            addLogEntry('success', `SHA-256 Hash: ${data.hash}`);
            addLogEntry('info', `File: ${data.filename}`);
            addLogEntry('info', `Timestamp: ${new Date(data.timestamp).toLocaleString()}`);
        } else if (data.integrity_verified !== undefined) {
            const status = data.integrity_verified ? '✅ VERIFIED' : '❌ MODIFIED';
            addLogEntry(data.integrity_verified ? 'success' : 'error', 
                       `File Integrity: ${status}`);
            addLogEntry('info', `Current Hash: ${data.current_hash}`);
            addLogEntry('info', `Stored Hash: ${data.stored_hash}`);
        } else if (data.message) {
            addLogEntry('success', data.message);
        } else if (data.hashes) {
            addLogEntry('info', `Stored Hashes (${data.count} files):`);
            Object.entries(data.hashes).forEach(([filename, info]) => {
                addLogEntry('info', `  ${filename}: ${info.hash}`);
            });
        } else if (data.stored_hashes !== undefined) {
            addLogEntry('info', '=== System Information ===');
            addLogEntry('info', `Stored Hashes: ${data.stored_hashes}`);
            addLogEntry('info', `Backup Files: ${data.backup_files}`);
            addLogEntry('info', `Encryption Key: ${data.encryption_key}`);
            addLogEntry('info', `Cipher Suite: ${data.cipher_suite}`);
        }
    } else {
        throw new Error(data.error || 'Operation failed');
    }
}

// Password Generator
function showPasswordGenerator() {
    const modal = document.getElementById('password-modal');
    const modalBody = modal.querySelector('.modal-body');
    
    modalBody.innerHTML = `
        <div class="password-generator">
            <div class="password-display">
                <div class="password" id="generated-password">Click Generate to create a password</div>
                <div class="password-strength" id="password-strength">--</div>
                <button class="copy-password" onclick="copyPassword()" title="Copy password">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
            
            <div class="password-options">
                <div class="option-group">
                    <label>Password Length: <span class="length-value" id="length-value">16</span></label>
                    <input type="range" id="length-slider" class="length-slider" min="12" max="32" value="16" oninput="updateLengthValue()">
                </div>
                
                <div class="option-group">
                    <label class="option-label">
                        <input type="checkbox" id="uppercase" checked> Uppercase Letters (A-Z)
                    </label>
                    <label class="option-label">
                        <input type="checkbox" id="lowercase" checked> Lowercase Letters (a-z)
                    </label>
                </div>
                
                <div class="option-group">
                    <label class="option-label">
                        <input type="checkbox" id="digits" checked> Numbers (0-9)
                    </label>
                    <label class="option-label">
                        <input type="checkbox" id="symbols" checked> Symbols (!@#$% etc.)
                    </label>
                </div>
            </div>
            
            <button class="generate-btn" onclick="generatePassword()">
                <i class="fas fa-key"></i> Generate Secure Password
            </button>
        </div>
    `;
    
    modal.style.display = 'block';
    updateLengthValue();
}

function closePasswordModal() {
    document.getElementById('password-modal').style.display = 'none';
}

function updateLengthValue() {
    const slider = document.getElementById('length-slider');
    const value = document.getElementById('length-value');
    if (slider && value) {
        value.textContent = slider.value;
    }
}

async function generatePassword() {
    const length = parseInt(document.getElementById('length-slider').value);
    const uppercase = document.getElementById('uppercase').checked;
    const lowercase = document.getElementById('lowercase').checked;
    const digits = document.getElementById('digits').checked;
    const symbols = document.getElementById('symbols').checked;
    
    try {
        const response = await fetch('/generate_password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                length: length,
                uppercase: uppercase,
                lowercase: lowercase,
                digits: digits,
                symbols: symbols
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentPassword = data.password;
            document.getElementById('generated-password').textContent = data.password;
            document.getElementById('password-strength').textContent = data.strength;
            
            // Color code strength
            const strengthElem = document.getElementById('password-strength');
            if (data.strength.includes('VERY STRONG')) {
                strengthElem.style.color = 'var(--success-color)';
            } else if (data.strength.includes('STRONG')) {
                strengthElem.style.color = 'var(--info-color)';
            } else if (data.strength.includes('MODERATE')) {
                strengthElem.style.color = '#ffd700';
            } else {
                strengthElem.style.color = 'var(--warning-color)';
            }
            
            addLogEntry('success', `Generated password: ${data.password}`);
            addLogEntry('info', `Strength: ${data.strength}`);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        showNotification('Password generation failed: ' + error.message, 'error');
        addLogEntry('error', `Password generation failed: ${error.message}`);
    }
}

function copyPassword() {
    if (!currentPassword) {
        showNotification('No password to copy', 'error');
        return;
    }
    
    navigator.clipboard.writeText(currentPassword).then(() => {
        showNotification('Password copied to clipboard', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = currentPassword;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Password copied to clipboard', 'success');
    });
}

// Output Console Management
function addLogEntry(type, message) {
    const consoleContent = document.getElementById('console-content');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        ${message}
    `;
    
    // Remove welcome message if it exists
    const welcomeMessage = consoleContent.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    consoleContent.appendChild(logEntry);
    consoleContent.scrollTop = consoleContent.scrollHeight;
}

function clearOutput() {
    const consoleContent = document.getElementById('console-content');
    consoleContent.innerHTML = `
        <div class="welcome-message">
            <i class="fas fa-shield-alt"></i>
            <h3>Output Cleared</h3>
            <p>Console output has been cleared.</p>
        </div>
    `;
    addLogEntry('info', 'Output console cleared');
}

function copyOutput() {
    const consoleContent = document.getElementById('console-content');
    const text = consoleContent.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Console output copied to clipboard', 'success');
    }).catch(() => {
        showNotification('Failed to copy output', 'error');
    });
}

function saveLog() {
    const consoleContent = document.getElementById('console-content');
    const text = consoleContent.textContent;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cybershield-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('Log saved successfully', 'success');
}

// System Information
async function updateSystemInfo() {
    try {
        const response = await fetch('/system_info');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('hash-count').textContent = data.stored_hashes;
            document.getElementById('backup-count').textContent = data.backup_files;
        }
    } catch (error) {
        console.error('Failed to update system info:', error);
    }
}

function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    document.getElementById('current-time').textContent = timeString;
}

// Notification System
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('password-modal');
    if (e.target === modal) {
        closePasswordModal();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'l':
                e.preventDefault();
                clearOutput();
                break;
            case 's':
                e.preventDefault();
                saveLog();
                break;
        }
    }
});