
/**
 * Toggle debug log visibility
 */
function toggleDebugLog() {
    const logContainer = document.getElementById('debug-log');
    const icon = document.getElementById('debug-toggle-icon');
    
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

// Make sure it's available globally needed for onclick
window.toggleDebugLog = toggleDebugLog;
