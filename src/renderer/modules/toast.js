// toast.js — the small floating status pill at the bottom of the window,
// optionally with an action button (used for the delete-undo flow).
import { dom } from './dom.js';

let toastTimer = null;

export function showToast(message, type = 'info', actionLabel, actionFn) {
  dom.toast.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  dom.toast.appendChild(text);

  if (actionLabel && actionFn) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action-btn';
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener('click', () => {
      dom.toast.hidden = true;
      clearTimeout(toastTimer);
      actionFn();
    });
    dom.toast.appendChild(actionBtn);
  }

  dom.toast.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, actionLabel ? 5000 : 2600);
}
