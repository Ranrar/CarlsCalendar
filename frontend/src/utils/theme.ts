/**
 * Theme utility — persists user preference in localStorage,
 * applies data-theme="light"|"dark" to <html>.
 */

export type Theme = 'dark' | 'light';

export const theme = {
  get current(): Theme {
    return (localStorage.getItem('theme') as Theme) ?? 'dark';
  },

  apply(t: Theme): void {
    document.documentElement.dataset['theme'] = t;
    localStorage.setItem('theme', t);
  },

  toggle(): Theme {
    const next: Theme = theme.current === 'dark' ? 'light' : 'dark';
    theme.apply(next);
    return next;
  },

  /** Call once on app boot before first render. */
  init(): void {
    theme.apply(theme.current);
  },
};
