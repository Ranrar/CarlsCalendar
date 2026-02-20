/**
 * Print helpers — trigger browser print dialog for specific views.
 */

/**
 * Print a single schedule (the element with class `.printable-schedule`).
 * Relies on @media print in print.css.
 */
export function printSchedule(): void {
  window.print();
}

/**
 * Print the week view (the element with class `.printable-week`).
 */
export function printWeek(): void {
  window.print();
}

/**
 * Add a "Print" button to `target` that triggers window.print().
 */
export function addPrintButton(target: HTMLElement, label = 'Print'): void {
  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary no-print';
  btn.textContent = label;
  btn.addEventListener('click', () => window.print());
  target.appendChild(btn);
}
