/**
 * Print helpers — trigger browser print dialog with correct page orientation.
 * Uses body class + a dynamic <style> block so @page can be scoped to context.
 */

/**
 * Print the current schedule view (portrait A4).
 * Applies `.printing-schedule` to body while printing so CSS can scope rules.
 */
export function printSchedule(): void {
  document.body.classList.add('printing-schedule');
  window.print();
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-schedule');
  }, { once: true });
}

/**
 * Print the weekly calendar view (landscape A4).
 * Injects a temporary `@page` override and `.printing-week` body class.
 */
export function printWeek(): void {
  const style = document.createElement('style');
  style.id = '__print-landscape';
  style.textContent = '@media print { @page { size: A4 landscape; margin: 10mm 8mm; } }';
  document.head.appendChild(style);
  document.body.classList.add('printing-week');
  window.print();
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-week');
    document.getElementById('__print-landscape')?.remove();
  }, { once: true });
}

/**
 * Print visual supports (A4 portrait, print-first cards/boards).
 */
export interface VisualSupportPrintOptions {
  cutLines?: boolean;
  cropMarks?: boolean;
}

export function printVisualSupport(options: VisualSupportPrintOptions = {}): void {
  document.body.classList.add('printing-visual-support');
  if (options.cutLines) document.body.classList.add('printing-vs-cut');
  if (options.cropMarks) document.body.classList.add('printing-vs-crop');
  window.print();
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-visual-support');
    document.body.classList.remove('printing-vs-cut');
    document.body.classList.remove('printing-vs-crop');
  }, { once: true });
}
