const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

const PREZZI_URL = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';
const STAZIONI_URL = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';

let cache = { stazioni: null, timestamp: 0 };

async function getDati() {
  const ora = Date.now();
  if (cache.stazioni && (ora - cache.timestamp) < 6 * 3600 * 1000) {
    return cache.stazioni;
  }

  console.log('Scarico dati MIMIT...');
  const [resPrezzi, resStazioni] = await Promise.all([
    fetch(PREZZI_URL),
    fetch(STAZIONI_URL)
  ]);
  const testoPrezzi = await resPrezzi.text();
  const testoStazioni = await resStazioni.text();

  const prezzi = {};
  testoPrezzi.split('\n').slice(1).forEach(r => {
    const c = r.split(';');
    if (c.length < 4) return;
    const id = c[0].trim(), tipo = c[1].trim(), prezzo = parseFloat(c[2].replace(',', '.'));
    if (!isNaN(prezzo)) {
      if (!prezzi[id]) prezzi[id] = {};
      prezzi[id][tipo] = prezzo;
    }
  });

  const stazioni = [];
  testoStazioni.split('\n').slice(1).forEach(r => {
    const c = r.split(';');
    if (c.length < 10) return;
    const lat = parseFloat(c[8].replace(',', '.')), lon = parseFloat(c[9].replace(',', '.'));
    if (isNaN(lat) || isNaN(lon)) return;
    const id = c[0].trim();
    stazioni.push({
      id,
      gestore: c[1].trim(),
      bandiera: c[2].trim(),
      nome: c[4].trim(),
      indirizzo: c[5].trim(),
      comune: c[6].trim(),
      provincia: c[7].trim(),
      lat, lon,
      prezzi: prezzi[id] || {}
    });
  });

  cache = { stazioni, timestamp: ora };
  console.log('Dati pronti: ' + stazioni.length + ' stazioni');
  return stazioni;
}

app.get('/vicini', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const raggio = parseFloat(req.query.raggio) || 10;
    const carb = req.query.carburante || 'Benzina';

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ errore: 'lat e lon richiesti' });
    }

    const mappa = { Benzina: 'Benzina', Diesel: 'Gasolio', GPL: 'GPL', Metano: 'Metano' };
    const chiave = mappa[carb] || 'Benzina';

    const tutte = await getDati();

    const vicini = tutte
      .filter(s => {
        if (!s.prezzi[chiave]) return false;
        const d = distanza(lat, lon, s.lat, s.lon);
        return d <= raggio;
      })
      .map(s => ({ ...s, distanza: distanza(lat, lon, s.lat, s.lon), prezzo: s.prezzi[chiave] }))
      .sort((a, b) => a.prezzo - b.prezzo)
      .slice(0, 30);

    res.json(vicini);
  } catch(e) {
    console.error(e);
    res.status(500).json({ errore: e.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true, cached: !!cache.stazioni, stazioni: cache.stazioni?.length || 0 }));

function distanza(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2-lat1)*Math.PI)/180;
  const dLon = ((lon2-lon1)*Math.PI)/180;
  const a = Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server avviato su porta ' + PORT);
  getDati().catch(console.error);
});
