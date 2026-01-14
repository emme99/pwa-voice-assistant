
/**
 * Toggle debug log visibility
 */
function toggleDebugLog() {
    const logContainer = document.getElementById('debug-log');
    const icon = document.getElementById('debug-toggle-icon');
    
    if (logContainer && icon) {
        if (logContainer.classList.contains('hidden')) {
            logContainer.classList.remove('hidden');
            icon.textContent = '▲';
            // Auto scroll to bottom when opening
            logContainer.scrollTop = logContainer.scrollHeight;
        } else {
            logContainer.classList.add('hidden');
            icon.textContent = '▼';
        }
    }
}

/**
 * Show a toast notification
 * @param {string} message 
 * @param {string} type 'info', 'success', 'warning', 'error'
 * @param {number} duration ms, default 3000
 */
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // Optional icon based on type
    // const icon = document.createElement('span');
    // icon.innerHTML = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    // toast.prepend(icon);

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-in forwards';
        toast.addEventListener('animationend', () => {
             if (toast.parentElement) toast.parentElement.removeChild(toast);
        });
    }, duration);
}

// Make sure it's available globally needed for onclick
window.toggleDebugLog = toggleDebugLog;
window.showToast = showToast;
