import wp from 'whatsapp-web.js';
import QR from 'qr-image';

const { Client, LocalAuth } = wp;

export const whatsappClientOptions = {
  puppeteer: {
    headless: true,
    protocolTimeout: Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT || 300000),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  },
  // La version mas reciente de WhatsApp Web rompe el envio de medios
  // ("Data passed to getter must include an id property"). Se puede fijar una
  // version anterior cacheada con WA_WEB_VERSION.
  ...(process.env.WA_WEB_VERSION
    ? { webVersionCache: { type: 'local', version: process.env.WA_WEB_VERSION } }
    : {})
};

export const whatsappClient = new Client({
  ...whatsappClientOptions,
  authStrategy: new LocalAuth({ clientId: 'jp-features' })
});

let latestQr = null;
whatsappClient.on('qr', qr => { latestQr = QR.imageSync(qr, { type: 'svg' }); });
whatsappClient.on('ready', () => { latestQr = null; console.log('WhatsApp Web Client is ready!'); });
whatsappClient.initialize().catch(error => console.error('WhatsApp initialization failed:', error.message));

const htmlTemplate = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>WhatsApp QR</title><style>body{font-family:system-ui;text-align:center;padding:2rem}svg{max-width:420px;width:90%;height:auto}</style></head><body>{{svg_string}}</body></html>';

export function getLatestQr() { return latestQr; }

export function qrHtml(svg) {
  return htmlTemplate.replace('{{svg_string}}', svg);
}

export function getQRHtmlString(res, svg = latestQr) {
  if (whatsappClient.info?.wid?.user) return res.send(`Phone number already associated ${whatsappClient.info.wid.user}`);
  if (svg) return res.send(qrHtml(svg));
  return res.status(202).send('QR is being generated. Refresh this page in a few seconds.');
}

export { Client, LocalAuth };
