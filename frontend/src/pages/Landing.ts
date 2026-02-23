import { t } from '@/i18n/i18n';

const FEATURES = [
  {
    icon: '📅',
    title: 'Visual schedules',
    desc: 'Picture-based daily routines children can read and follow independently.',
  },
  {
    icon: '🗓️',
    title: 'Weekly calendar',
    desc: 'A clear week view so parents can plan ahead and spot conflicts at a glance.',
  },
  {
    icon: '📱',
    title: 'QR code login',
    desc: "Children log in by scanning a QR code — no passwords, no frustration.",
  },
  {
    icon: '👨\u200d👩\u200d👧',
    title: 'Parent dashboard',
    desc: 'Manage multiple children, schedules, and images from a single place.',
  },
  {
    icon: '🖨️',
    title: 'Print-ready',
    desc: 'Generate print-friendly schedules to laminate and hang on the wall.',
  },
  {
    icon: '🔒',
    title: 'GDPR-compliant',
    desc: 'Runs in your own infrastructure. Privacy by design, no third-party tracking.',
  },
];

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <main class="landing">
      <section class="hero container">
        <div class="hero__brand">
          <span class="hero__brand-mark">CC</span>
          <h1 class="hero__title">${t('app.name')}</h1>
        </div>
        <span class="hero__eyebrow">C.A.R.L. — ${t('app.tagline')}</span>
        <p class="hero__tagline">
          A visual scheduling app designed for children and adults with autism spectrum disorder.
        </p>
        <div class="hero__actions">
          <a class="btn btn-primary" href="/login">${t('nav.login')}</a>
          <a class="btn btn-secondary" href="/register">${t('nav.register')}</a>
        </div>
      </section>

      <section class="features container">
        <div class="features__header">
          <h2>Everything your family needs</h2>
          <p>Structured routines reduce anxiety and build independence — Carls Calendar makes it simple.</p>
        </div>
        <div class="features__grid">
          ${FEATURES.map((f) => `
            <div class="feature-card">
              <span class="feature-card__icon">${f.icon}</span>
              <div class="feature-card__title">${f.title}</div>
              <p class="feature-card__desc">${f.desc}</p>
            </div>
          `).join('')}
        </div>
      </section>
    </main>
  `;
}
