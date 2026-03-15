const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

const PREZZI_URL = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';
const STAZIONI_URL = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';

app.get('/prezzi', async (req, res) => {
  try {
    const r = await fetch(PREZZI_URL);
    const testo = await r.text();
    res.send(testo);
  } catch(e) {
    res.status(500).send('Errore');
  }
});

app.get('/stazioni', async (req, res) => {
  try {
    const r = await fetch(STAZIONI_URL);
    const testo = await r.text();
    res.send(testo);
  } catch(e) {
    res.status(500).send('Errore');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server avviato su porta ' + PORT));
