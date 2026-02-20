export function render(container: HTMLElement): void {
  container.innerHTML = `
    <main class="container page-content legal-page">
      <h1>Terms of Service</h1>
      <p class="legal-meta">Last updated: 20 February 2026</p>

      <section class="legal-section">
        <h2>1. Acceptance</h2>
        <p>By using Carls Calendar you agree to these terms. If you do not agree, do not use the application.</p>
      </section>

      <section class="legal-section">
        <h2>2. Use of the service</h2>
        <ul>
          <li>You must be at least 18 years old to create a parent account.</li>
          <li>You are responsible for all content you upload and all activity under your account.</li>
          <li>You may not use the service for any unlawful purpose.</li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>3. Child accounts</h2>
        <p>Child profiles are created by a parent or guardian who is responsible for ensuring
        appropriate use. QR login tokens must be kept secure.</p>
      </section>

      <section class="legal-section">
        <h2>4. Content</h2>
        <p>You retain ownership of content you upload. By uploading images you confirm you have
        the right to use them.</p>
      </section>

      <section class="legal-section">
        <h2>5. Availability</h2>
        <p>Carls Calendar is provided as-is. The operator makes no guarantee of uptime or
        availability.</p>
      </section>

      <section class="legal-section">
        <h2>6. Changes to terms</h2>
        <p>Terms may be updated at any time. Continued use of the service constitutes
        acceptance of the updated terms.</p>
      </section>
    </main>
  `;
}
