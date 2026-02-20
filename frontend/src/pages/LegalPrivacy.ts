export function render(container: HTMLElement): void {
  container.innerHTML = `
    <main class="container page-content legal-page">
      <h1>Privacy Policy</h1>
      <p class="legal-meta">Last updated: 20 February 2026</p>

      <section class="legal-section">
        <h2>1. Who we are</h2>
        <p>Carls Calendar is a self-hosted application. The operator of this instance is responsible
        for personal data processed within it. No data is sent to the Carls Calendar project or
        any third party.</p>
      </section>

      <section class="legal-section">
        <h2>2. Data we collect</h2>
        <ul>
          <li>Account information: email address and hashed password.</li>
          <li>Child profiles: display name and optional avatar image.</li>
          <li>Schedule data: titles, descriptions, pictures, and time assignments you create.</li>
          <li>Session cookies required for authentication (no tracking cookies).</li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>3. How we use your data</h2>
        <p>Data is used solely to provide the scheduling service. It is never shared with,
        sold to, or processed by third parties.</p>
      </section>

      <section class="legal-section">
        <h2>4. Your rights (GDPR)</h2>
        <p>You have the right to access, correct, export, and delete your personal data at any time.
        Contact the administrator of this instance to exercise these rights.</p>
      </section>

      <section class="legal-section">
        <h2>5. Data retention</h2>
        <p>Account data is retained until you delete your account. Deleted data is permanently
        removed within 30 days.</p>
      </section>

      <section class="legal-section">
        <h2>6. Contact</h2>
        <p>For privacy questions, use the <a href="/contact">contact form</a>.</p>
      </section>
    </main>
  `;
}
