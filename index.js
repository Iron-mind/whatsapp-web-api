import express from 'express';
import { getQRHtmlString, whatsappClient } from './whatsapp-web.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const port = 6900;

// Configurar el motor de vistas Pug
app.set('view engine', 'pug');

// Ruta raíz
app.get('/test', (req, res) => {
  // res.render('index', { title: 'Mi primera aplicación Express' });
  res.json({ message: 'Hello World' });
});


app.get('/whatsapp-web/qr', (req, res) => {
  try {
    getQRHtmlString(res);
  } catch (err) {
    console.log(err);
    res.json({ message: 'Error', success: false });
  }
});

app.post('/whatsapp-web/message', async (req, res) => {
  try {
    //phone sample: 573002222222 
    console.log(req.body);

    const { phone, message } = req.body;
    await whatsappClient.sendMessage("57" + phone + "@c.us", message);
    res.json({ message: 'Message sent ', success: true });

  } catch (error) {
    console.log(error);
    res.send({ message: 'Error ' + error, success: false });

  }
});


app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});