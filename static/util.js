export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function throttle(fn, limit) {
  let last = 0;
  let timer;
  return function (...args) {
    const now = Date.now();
    const remaining = limit - (now - last);
    if (remaining <= 0) {
      last = now;
      fn.apply(this, args);
    } else {
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}

export const getRectCenter = (rect) => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

export const getChildren = (node) => $$(`[data-parent="${node.dataset.id}"]`);