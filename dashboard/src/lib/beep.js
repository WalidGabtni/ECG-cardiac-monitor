const audioCtx = new (window.AudioContext || window.webkitAudioContext)()

export function playBeep(type = 'alert') {
  const oscillator = audioCtx.createOscillator()
  const gainNode = audioCtx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(audioCtx.destination)

  if (type === 'critical') {
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
    oscillator.frequency.setValueAtTime(660, audioCtx.currentTime + 0.1)
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.2)
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4)
    oscillator.start(audioCtx.currentTime)
    oscillator.stop(audioCtx.currentTime + 0.4)
  } else {
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime)
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2)
    oscillator.start(audioCtx.currentTime)
    oscillator.stop(audioCtx.currentTime + 0.2)
  }
}