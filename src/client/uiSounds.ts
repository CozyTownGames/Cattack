import * as Phaser from 'phaser';
import { isSoundMuted, onSoundMutedChanged } from './soundSettings';

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext();
  }
  return audioContext;
};

const playTone = (
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  unlockOnGesture = false
): void => {
  try {
    if (document.hidden || isSoundMuted()) return;
    const context = getAudioContext();
    if (context.state === 'suspended') {
      if (!unlockOnGesture) return;
      void context.resume()
        .then(() => {
          if (!isSoundMuted()) playTone(frequency, duration, volume, type);
        })
        .catch(() => undefined);
      return;
    }

    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch (_) {
    // UI sounds are optional when browser audio permission is unavailable.
  }
};

const playHoverClick = (): void => {
  playTone(260, 0.035, 0.06, 'square');
};

const playActivationBeep = (): void => {
  playTone(520, 0.08, 0.06, 'sine', true);
};

const DOM_UI_SELECTOR = 'button, a[href], input, select, textarea, [role="button"], [tabindex]';

const closestUiControl = (target: EventTarget | null): Element | null => {
  return target instanceof Element ? target.closest(DOM_UI_SELECTOR) : null;
};

export const installDomUiSounds = (): void => {
  onSoundMutedChanged((muted) => {
    if (muted && audioContext?.state === 'running') void audioContext.suspend();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audioContext?.state === 'running') void audioContext.suspend();
  });
  document.addEventListener('pointerover', (event) => {
    const control = closestUiControl(event.target);
    if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
    if (closestUiControl(event.relatedTarget) === control) return;
    playHoverClick();
  });

  document.addEventListener('click', (event) => {
    const control = closestUiControl(event.target);
    if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
    playActivationBeep();
  });
};

export const installPhaserUiSounds = (game: Phaser.Game): void => {
  const installedScenes = new WeakSet<Phaser.Scene>();
  const syncGameMute = (): void => {
    game.sound.mute = document.hidden || isSoundMuted();
  };
  syncGameMute();
  const stopSoundListener = onSoundMutedChanged((muted) => {
    game.sound.mute = document.hidden || muted;
  });
  document.addEventListener('visibilitychange', syncGameMute);
  game.events.once(Phaser.Core.Events.DESTROY, stopSoundListener);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    document.removeEventListener('visibilitychange', syncGameMute);
  });

  game.events.on(Phaser.Core.Events.POST_STEP, () => {
    game.scene.getScenes(true).forEach((scene) => {
      if (installedScenes.has(scene)) return;
      installedScenes.add(scene);
      scene.input.on(Phaser.Input.Events.GAMEOBJECT_OVER, playHoverClick);
      scene.input.on(Phaser.Input.Events.GAMEOBJECT_DOWN, playActivationBeep);
    });
  });
};
