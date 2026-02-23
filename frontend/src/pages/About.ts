import { t } from '@/i18n/i18n';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <main class="container page-content">
      <h1>${t('nav.about')}</h1>
      <p class="page-lead">
        Carls Calendar (C.A.R.L.) is a visual scheduling app designed for children and adults
        with autism spectrum disorder (ASD). It helps families build predictable, calming
        daily routines through pictures, colours, and clear time blocks.
      </p>

      <section class="about-section">
        <h2>What does C.A.R.L. stand for?</h2>
        <dl class="acronym-list">
          <div><dt>C</dt><dd><strong>Calm</strong> — reduce anxiety through predictability</dd></div>
          <div><dt>A</dt><dd><strong>Aware</strong> — understand what's coming next</dd></div>
          <div><dt>R</dt><dd><strong>Routine</strong> — structured days build confidence</dd></div>
          <div><dt>L</dt><dd><strong>Learning</strong> — grow independence step by step</dd></div>
        </dl>
      </section>

      <section class="about-section">
        <h2>How it works</h2>
        <ol class="about-steps">
          <li>A parent creates an account. Adding a child profile is optional.</li>
          <li>They build visual schedules using titles, pictures, and time blocks.</li>
          <li>Schedules are assigned to days on the family calendar.</li>
          <li>The schedule can be printed directly — or the child logs in by scanning a QR code. No passwords needed.</li>
          <li>The child sees a large, picture-based view of their day.</li>
        </ol>
      </section>

      <section class="about-section">
        <h2>Privacy &amp; data</h2>
        <p>
          Carls Calendar is self-hosted. Your data never leaves your infrastructure.
          No analytics, no third-party tracking, no ads. Read our
          <a href="/privacy">Privacy Policy</a> for details.
        </p>
      </section>

      <section class="about-section">
        <h2>Pictograms &amp; attribution (ARASAAC)</h2>
        <p>
          Carls Calendar integrates ARASAAC pictograms to support accessible visual communication.
          Huge thanks to the ARASAAC team, Government of Aragón, and author Sergio Palao for
          making these resources available to the community.
        </p>
        <p style="margin-top:.75rem">
          Attribution: The pictographic symbols used are the property of the Government of Aragón
          and have been created by Sergio Palao for
          <a href="https://www.arasaac.org" target="_blank" rel="noreferrer">ARASAAC</a>,
          distributed under Creative Commons BY-NC-SA 4.0.
          See <a href="https://arasaac.org/terms-of-use" target="_blank" rel="noreferrer">ARASAAC Terms of Use</a>.
        </p>
      </section>
    </main>
  `;
}
