
/**
 * Play a short beep sound for wake word confirmation
 */
function playWakeSound() {
    if (!STATE.audioContext) return;
    
    try {
        const oscillator = STATE.audioContext.createOscillator();
        const gainNode = STATE.audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, STATE.audioContext.currentTime); // A5
        oscillator.frequency.exponentialRampToValueAtTime(440, STATE.audioContext.currentTime + 0.1); // Drop to A4
        
        gainNode.gain.setValueAtTime(0.1, STATE.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, STATE.audioContext.currentTime + 0.1);
        
        oscillator.connect(gainNode);
        gainNode.connect(STATE.audioContext.destination);
        
        oscillator.start();
        oscillator.stop(STATE.audioContext.currentTime + 0.15);
    } catch (e) {
        console.error('Error playing wake sound:', e);
    }
}
