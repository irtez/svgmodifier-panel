const STYLE_ID = 'notify-tooltip-hide-scrollbar-style';

export function injectHideScrollbarStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = '.hide-scrollbar::-webkit-scrollbar { display: none; }';
  document.head.appendChild(style);
}
