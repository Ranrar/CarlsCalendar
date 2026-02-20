export function render(container: HTMLElement): void {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card card" style="text-align:center">
        <span style="font-size:3rem;display:block;margin-bottom:1rem">✉️</span>
        <h1>Check your email</h1>
        <p style="margin-top:1rem">
          We sent a verification link to your email address.<br>
          Click the link to activate your account.
        </p>
        <div class="form-footer" style="align-items:center">
          <a href="/login">Back to login</a>
        </div>
      </div>
    </div>
  `;
}
