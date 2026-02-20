import QRCode from 'qrcode';

/**
 * Renders a QR code into a <canvas> inside `container`.
 * `data` is the string to encode (e.g. a login URL with ?token=…).
 */
export async function renderQrCode(container: HTMLElement, data: string): Promise<void> {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  await QRCode.toCanvas(canvas, data, {
    width: 256,
    margin: 2,
    color: {
      dark: '#e8eaf0',
      light: '#151822',
    },
  });
}

/**
 * Returns a PNG data URL for the QR code (use for download / print).
 */
export async function qrCodeDataUrl(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    width: 512,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}
