const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

let cache = null;
let cacheTime = 0;

function distanza(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2-lat1)*Math.PI)/180;
  const dLon = ((lon2-lon1)*Math.PI)/180;
  const a = Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

async function caricaCache() {
  if (cache && (Date.now() - cacheTime) < 6*3600*1000) return cache;
  
  console.log('Download MIMIT...');
  
  const [r1, r2] = await Promise.all([
    fetch('https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv'),
    fetch('https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv')
  ]);
  
  const [t1, t2] = await Promise.all([r1.text(), r2.text()]);
  
  const prezzi = {};
    t1.split('\n').slice(2).forEach(r => {
      const c = r.split('|');
    if (c.length < 3) return;
    const id = c[0].trim(), tipo = c[1].trim(), p = parseFloat(c[2].replace(',','.'));
    if (id && tipo && !isNaN(p)) {
      if (!prezzi[id]) prezzi[id] = {};
      prezzi[id][tipo] = p;
    }
  });
  
  const stazioni = [];
    t2.split('\n').slice(2).forEach(r => {
      const c = r.split('|');
    if (c.length < 10) return;
    const lat = parseFloat(c[8].replace(',','.')), lon = parseFloat(c[9].replace(',','.'));
    if (isNaN(lat)||isNaN(lon)) return;
    const id = c[0].trim();
    stazioni.push({ id, bandiera:c[2].trim(), comune:c[6].trim(), provincia:c[7].trim(), indirizzo:c[5].trim(), lat, lon, prezzi:prezzi[id]||{} });
  });
  
  cache = stazioni;
  cacheTime = Date.now();
console.log('Prima riga prezzi: ' + t1.split('\n')[0]);
console.log('Prima riga stazioni: ' + t2.split('\n')[0]);
console.log('Seconda riga stazioni: ' + t2.split('\n')[1]);
  return stazioni;
}
app.get('/test', async (req, res) => {
  const r = await fetch('https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv');
  const t = await r.text();
  res.send(t.split('\n').slice(0,5).join('\n'));
});
app.get('/vicini', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const raggio = parseFloat(req.query.raggio)||10;
    const carb = req.query.carburante||'Benzina';
    const mappa = {Benzina:'Benzina',Diesel:'Gasolio',GPL:'GPL',Metano:'Metano'};
    const chiave = mappa[carb]||'Benzina';
    
    const tutte = await caricaCache();
    const vicini = tutte
      .filter(s => s.prezzi[chiave] && distanza(lat,lon,s.lat,s.lon)<=raggio)
      .map(s => ({...s, distanza:distanza(lat,lon,s.lat,s.lon), prezzo:s.prezzi[chiave]}))
      .sort((a,b)=>a.prezzo-b.prezzo)
      .slice(0,30);
    
    res.json(vicini);
  } catch(e) {
    console.error(e);
    res.status(500).json({errore:e.message});
  }
});

app.get('/health', (req,res) => res.json({ok:true, stazioni:cache?cache.length:0, cached:!!cache}));

const PORT = process.env.PORT||3000;
app.listen(PORT, () => {
  console.log('Porta ' + PORT);
  caricaCache().catch(console.error);
});
