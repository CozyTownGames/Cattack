import { isSoundMuted } from './soundSettings';

const activeEffects = new Set<HTMLAudioElement>();

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  activeEffects.forEach((audio) => audio.pause());
  activeEffects.clear();
});

export const playAudioEffect = (source: string, volume = 1): void => {
  if (document.hidden || isSoundMuted()) return;
  const audio = new Audio(source);
  audio.volume = volume;
  activeEffects.add(audio);
  audio.addEventListener('ended', () => activeEffects.delete(audio), { once: true });
  void audio.play().catch(() => undefined);
};
