#!/usr/bin/env node

// scripts/fetch_covers.js
// Usage examples:
//  PROVIDER=steam node scripts/fetch_covers.js
//  PROVIDER=rawg RAWG_KEY=your_key node scripts/fetch_covers.js
//  PROVIDER=igdb IGDB_CLIENT_ID=... IGDB_CLIENT_SECRET=... node scripts/fetch_covers.js
// Options: --dry-run, --force

const fs = require('fs/promises');
const path = require('path');

const provider = process.env.PROVIDER || process.argv[2] || 'steam';
const RAWG_KEY = process.env.RAWG_KEY || null;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID || null;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET || null;
const force = process.argv.includes('--force') || process.argv.includes('-f');
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

const COVER_DIR = path.join(__dirname, '..', 'covers');
const GAMES_JSON = path.join(__dirname, '..', 'games.json');

async function ensureDir() {
  await fs.mkdir(COVER_DIR, { recursive: true });
}

function slugify(s) {
  return s.toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,80);
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function downloadToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buffer);
}

async function searchSteam(title) {
  try {
    const searchUrl = `https://store.steampowered.com/api/storesearch/?cc=us&l=en&term=${encodeURIComponent(title)}`;
    const json = await fetchJson(searchUrl);
    if (json && json.items && json.items.length) {
      const appid = json.items[0].id;
      const details = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`);
      if (details && details[appid] && details[appid].data) {
        const d = details[appid].data;
        return d.header_image || (d.screenshots && d.screenshots[0] && d.screenshots[0].path_full) || d.background || null;
      }
    }
  } catch (e) {
    console.error('Steam search error:', e.message);
  }
  return null;
}

async function searchRawg(title) {
  if (!RAWG_KEY) {
    console.error('RAWG_KEY not set in env');
    return null;
  }
  try {
    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(title)}&page_size=1&key=${RAWG_KEY}`;
    const json = await fetchJson(url);
    if (json && json.results && json.results.length) {
      const r = json.results[0];
      return r.background_image || r.background_image_additional || null;
    }
  } catch (e) {
    console.error('RAWG error:', e.message);
  }
  return null;
}

async function searchIgdb(title) {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    console.error('IGDB credentials not provided');
    return null;
  }
  try {
    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) throw new Error('Failed to get IGDB access token');

    const searchRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: { 'Client-ID': IGDB_CLIENT_ID, 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      body: `search "${title}"; fields name,cover; limit 1;`
    });
    const games = await searchRes.json();
    if (games && games.length && games[0].cover) {
      const coverId = games[0].cover;
      const coverRes = await fetch('https://api.igdb.com/v4/covers', {
        method: 'POST',
        headers: { 'Client-ID': IGDB_CLIENT_ID, 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        body: `fields url; where id = ${coverId};`
      });
      const covers = await coverRes.json();
      if (covers && covers.length && covers[0].url) {
        let url = covers[0].url;
        if (url.startsWith('//')) url = 'https:' + url;
        // prefer larger size
        url = url.replace('t_thumb', 't_cover_big');
        return url;
      }
    }
  } catch (e) {
    console.error('IGDB error:', e.message);
  }
  return null;
}

async function main() {
  await ensureDir();
  const raw = await fs.readFile(GAMES_JSON, 'utf8');
  const data = JSON.parse(raw);
  const games = data.downloads || data;
  let changed = false;

  for (const g of games) {
    if (!g || !g.title) continue;
    if (g.cover && !force) {
      console.log('Skip (has cover):', g.title);
      continue;
    }

    console.log('Looking for:', g.title);
    let imageUrl = null;
    if (provider === 'steam') imageUrl = await searchSteam(g.title);
    else if (provider === 'rawg') imageUrl = await searchRawg(g.title);
    else if (provider === 'igdb') imageUrl = await searchIgdb(g.title);
    else {
      console.error('Unknown provider:', provider);
    }

    if (!imageUrl) {
      console.log('No image found for', g.title);
      continue;
    }

    try {
      const ext = (new URL(imageUrl)).pathname.split('.').pop().split('?')[0] || 'jpg';
      const filename = `${slugify(g.title)}.${ext}`;
      const out = path.join(COVER_DIR, filename);
      if (dryRun) {
        console.log('[dry] would download', imageUrl, '->', out);
        g.cover = path.posix.join('covers', filename);
        changed = true;
        continue;
      }
      await downloadToFile(imageUrl, out);
      g.cover = path.posix.join('covers', filename);
      console.log('Saved cover for', g.title, '->', g.cover);
      changed = true;
    } catch (e) {
      console.error('Failed to save cover for', g.title, e.message);
    }
  }

  if (changed) {
    await fs.writeFile(GAMES_JSON, JSON.stringify(data, null, 2), 'utf8');
    console.log('Updated games.json. Commit the covers/ directory and updated games.json to include images in the site.');
  } else {
    console.log('No changes.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
