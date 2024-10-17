import wp from "whatsapp-web.js";

const { Client, LocalAuth } = wp;
import QR from "qr-image";

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    <style>
        svg {
            width: 40%;
            height: auto;
        }
    </style>
</head>
<body>
  {{svg_string}}
</body>
</html>`
export const whatsappClient = new Client({
  puppeteer: {
    args: ["--no-sandbox"],
  },

  authStrategy: new LocalAuth({
    clientId: "jp-features"
  }),
});
whatsappClient.initialize()

export function getQRHtmlString(res) {
  console.log("Getting QR code");

  let svg_string = "";
  whatsappClient.on("qr", (qr) => {
    console.log('QR RECEIVED', qr);
    // QR.image(qr, { type: 'png' }).pipe(require('fs').createWriteStream('qr.png'));
    svg_string = QR.imageSync(qr, { type: "svg" });
    const html = htmlTemplate.replace("{{svg_string}}", svg_string);
    res.send(html);
  });
  return svg_string;
}

whatsappClient.on("ready", () => {
  console.log("Wp web Client is ready!");
  whatsappClient.sendMessage(
    whatsappClient.info.wid.user + "@c.us",
    "Ya tienes whatsapp asociado para enviar notificaciones"
  );
});


