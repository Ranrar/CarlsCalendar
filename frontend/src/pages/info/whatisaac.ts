import { t } from '@/i18n/i18n';

export function render(container: HTMLElement): void {
  container.innerHTML = `
    <main class="container page-content">
      <h1>${t('information_page.title')}</h1>
      <p class="page-lead">${t('information_page.lead')}</p>

      <section class="card about-section">
        <h2>${t('information_page.what_is_title')}</h2>
        <p>${t('information_page.what_is_p1')}</p>
        <p>${t('information_page.what_is_p2')}</p>
      </section>

      <section class="card about-section">
        <h2>${t('information_page.who_title')}</h2>
        <p>${t('information_page.who_intro')}</p>
        <ul class="about-steps">
          <li>${t('information_page.who_items.motor')}</li>
          <li>${t('information_page.who_items.autism')}</li>
          <li>${t('information_page.who_items.language')}</li>
          <li>${t('information_page.who_items.neuro')}</li>
          <li>${t('information_page.who_items.temporary')}</li>
        </ul>
      </section>

      <section class="card about-section">
        <h2>${t('information_page.how_title')}</h2>
        <p>${t('information_page.how_intro')}</p>
        <dl class="acronym-list">
          <div><dt>1</dt><dd><strong>${t('information_page.how_parts.symbols_title')}</strong> — ${t('information_page.how_parts.symbols_body')}</dd></div>
          <div><dt>2</dt><dd><strong>${t('information_page.how_parts.tools_title')}</strong> — ${t('information_page.how_parts.tools_body')}</dd></div>
          <div><dt>3</dt><dd><strong>${t('information_page.how_parts.access_title')}</strong> — ${t('information_page.how_parts.access_body')}</dd></div>
          <div><dt>4</dt><dd><strong>${t('information_page.how_parts.partners_title')}</strong> — ${t('information_page.how_parts.partners_body')}</dd></div>
        </dl>
      </section>

      <section class="card about-section">
        <h2>${t('information_page.getting_started_title')}</h2>
        <ol class="about-steps">
          <li>${t('information_page.getting_started_items.assess')}</li>
          <li>${t('information_page.getting_started_items.words')}</li>
          <li>${t('information_page.getting_started_items.model')}</li>
          <li>${t('information_page.getting_started_items.consistency')}</li>
          <li>${t('information_page.getting_started_items.review')}</li>
        </ol>
      </section>

      <section class="card about-section">
        <h2>${t('information_page.myths_title')}</h2>
        <p><strong>${t('information_page.myths_m1_title')}</strong> ${t('information_page.myths_m1_body')}</p>
        <p><strong>${t('information_page.myths_m2_title')}</strong> ${t('information_page.myths_m2_body')}</p>
      </section>

      <section class="card about-section">
        <h2>${t('information_page.references_title')}</h2>
        <p>
          ${t('information_page.references_body')}
          <a href="https://arasaac.org/aac/en" target="_blank" rel="noreferrer">ARASAAC — What is AAC?</a>
          ${t('information_page.references_and')}
          <a href="https://www.utac.cat/" target="_blank" rel="noreferrer">UTAC</a>.
        </p>
      </section>
    </main>
  `;
}
