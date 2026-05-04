const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const ytSearch = require('yt-search');
const { getSubtitles } = require('youtube-captions-scraper');

const app = express();
app.use(cors());

const https = require('https');

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('No url provided');

  try {
    const urlObj = new URL(targetUrl);
    const origin = urlObj.origin;

    // Define different header profiles to attempt
    const profiles = [
      {
        name: 'Standard (No Origin/Referer)',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive'
        }
      },
      {
        name: 'Spoofed Origin & Referer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Connection': 'keep-alive',
          'Origin': origin,
          'Referer': origin + '/'
        }
      },
      {
         name: 'Mobile App Spoof',
         headers: {
           'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
           'Accept': '*/*',
           'Connection': 'keep-alive',
           'Origin': origin
         }
      }
    ];

    let fetchRes = null;
    let successfulProfile = null;

    // Fallback logic loop
    for (const profile of profiles) {
      try {
        const response = await fetch(targetUrl, { headers: profile.headers });
        
        // If it's a success or partial content, we found our winner
        if (response.status === 200 || response.status === 206) {
          fetchRes = response;
          successfulProfile = profile.name;
          break;
        } else {
          // Keep the last response in case all fail
          fetchRes = response;
        }
      } catch (err) {
        console.error(`Profile ${profile.name} failed with network error:`, err.message);
      }
    }

    if (successfulProfile) {
      console.log(`[PROXY] Successfully connected to ${urlObj.hostname} using profile: ${successfulProfile}`);
    } else {
      console.error(`[PROXY] All fallback profiles failed for ${urlObj.hostname}. Returning last status: ${fetchRes ? fetchRes.status : 500}`);
    }

    if (!fetchRes) {
       return res.status(500).send('Network failure across all proxy profiles.');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    
    const contentType = fetchRes.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);

    res.status(fetchRes.status);
    
    if (fetchRes.body) {
      const isM3u8 = (contentType && contentType.toLowerCase().includes('mpegurl')) || targetUrl.toLowerCase().includes('.m3u8');
      
      if (isM3u8) {
        let text = await fetchRes.text();
        const baseUrl = new URL(targetUrl);
        
        const lines = text.split('\n');
        const rewrittenLines = lines.map(line => {
           const trimmed = line.trim();
           // Lines not starting with # are media chunk URLs or nested playlist URLs
           if (trimmed && !trimmed.startsWith('#')) {
              try {
                 return new URL(trimmed, baseUrl.href).href;
              } catch(e) {
                 return line;
              }
           }
           // EXT-X-KEY URIs also need resolving
           if (trimmed.startsWith('#EXT-X-KEY:')) {
               return trimmed.replace(/URI="([^"]+)"/, (match, p1) => {
                   try {
                       return `URI="${new URL(p1, baseUrl.href).href}"`;
                   } catch(e) {
                       return match;
                   }
               });
           }
           return line;
        });
        res.send(rewrittenLines.join('\n'));
      } else {
        const { Readable } = require('stream');
        Readable.fromWeb(fetchRes.body).pipe(res);
      }
    } else {
      res.end();
    }
  } catch (err) {
    console.error('[PROXY] Fatal error:', err.message);
    res.status(500).send(err.message);
  }
});

app.get('/proxy/subtitle', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('No url provided');

  try {
    const zlib = require('zlib');
    const https = require('https');
    
    https.get(targetUrl, (proxyRes) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Content-Type', 'text/plain');
      
      const unzip = zlib.createGunzip();
      proxyRes.pipe(unzip).pipe(res);
      
      unzip.on('error', (err) => {
         console.error('Subtitle unzip error:', err.message);
         if (!res.headersSent) res.status(500).send('Failed to extract subtitle');
      });
    }).on('error', (err) => {
      res.status(500).send(err.message);
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();
const userColors = ['#fde047', '#ffffff', '#f9a8d4', '#86efac', '#fca5a5', '#93c5fd', '#d8b4fe', '#c4b5fd', '#fcd34d', '#fdba74'];

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('get_used_colors', (roomId, callback) => {
    if (rooms.has(roomId)) {
      const r = rooms.get(roomId);
      const used = Array.from(r.users.values()).map(u => u.color);
      callback(used);
    } else {
      callback([]);
    }
  });

  socket.on('join_room', ({ roomId, user }) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        media: { url: '', title: '' },
        playback: { playing: false, time: 0, speed: 1, lastUpdate: Date.now() },
        chat: []
      });
    }

    const room = rooms.get(roomId);
    
    // Determine color
    let color = user.color;
    const usedColors = Array.from(room.users.values()).map(u => u.color);
    if (!color || usedColors.includes(color)) {
      // Find first available color
      color = userColors.find(c => !usedColors.includes(c)) || userColors[room.users.size % userColors.length];
    }

    const userInfo = { id: socket.id, color, ...user };
    room.users.set(socket.id, userInfo);

    // Calculate current time before sending to new user
    let currentAssumedTime = room.playback.time;
    if (room.playback.playing) {
      currentAssumedTime += ((Date.now() - room.playback.lastUpdate) / 1000) * room.playback.speed;
    }

    // Send current state to the new user
    socket.emit('room_state', {
      media: room.media,
      playback: { ...room.playback, time: currentAssumedTime },
      users: Array.from(room.users.values()),
      chat: room.chat.slice(-50) // Send last 50 messages
    });

    // Notify others
    socket.to(roomId).emit('user_joined', userInfo);
    io.to(roomId).emit('users_update', Array.from(room.users.values()));

    socket.on('disconnect', () => {
      if (rooms.has(roomId)) {
        const r = rooms.get(roomId);
        r.users.delete(socket.id);
        io.to(roomId).emit('users_update', Array.from(r.users.values()));
        socket.to(roomId).emit('user_left', socket.id);
        if (r.users.size === 0) {
          rooms.delete(roomId);
        }
      }
    });

    socket.on('update_profile', (updates) => {
      if (rooms.has(roomId)) {
        const r = rooms.get(roomId);
        if (r.users.has(socket.id)) {
           const currentUser = r.users.get(socket.id);
           const updatedUser = { ...currentUser, ...updates };
           r.users.set(socket.id, updatedUser);
           io.to(roomId).emit('users_update', Array.from(r.users.values()));
        }
      }
    });

    // Media & Playback Sync
    socket.on('change_media', (media) => {
      if (rooms.has(roomId)) {
        const r = rooms.get(roomId);
        r.media = media;
        r.playback = { playing: true, time: 0, speed: 1, lastUpdate: Date.now() }; // Autoplay
        io.to(roomId).emit('media_changed', r.media);
        io.to(roomId).emit('playback_sync', r.playback);
      }
    });

    socket.on('sync_playback', (state) => {
      if (rooms.has(roomId)) {
         const r = rooms.get(roomId);
         r.playback = { ...r.playback, ...state, lastUpdate: Date.now() };
         socket.to(roomId).emit('playback_sync', r.playback);
      }
    });

    socket.on('request_sync', () => {
       if (rooms.has(roomId)) {
          const r = rooms.get(roomId);
          let currentAssumedTime = r.playback.time;
          if (r.playback.playing) {
             currentAssumedTime += ((Date.now() - r.playback.lastUpdate) / 1000) * r.playback.speed;
          }
          socket.emit('playback_sync', { ...r.playback, time: currentAssumedTime });
       }
    });

    // Chat & Reactions
    socket.on('send_message', (msg) => {
      if (rooms.has(roomId)) {
         const r = rooms.get(roomId);
         const currentUser = r.users.get(socket.id);
         const message = { id: Date.now() + Math.random(), sender: currentUser, ...msg, timestamp: Date.now() };
         r.chat.push(message);
         if (r.chat.length > 100) r.chat.shift();
         io.to(roomId).emit('new_message', message);
      }
    });

    socket.on('send_reaction', (reaction) => {
      if (rooms.has(roomId)) {
         const r = rooms.get(roomId);
         const currentUser = r.users.get(socket.id);
         io.to(roomId).emit('new_reaction', { sender: currentUser, emoji: reaction, id: Date.now() + Math.random() });
         
         // Also send as a chat message
         const reactMsg = { 
           id: Date.now() + Math.random(), 
           sender: currentUser, 
           text: `reacted ${reaction}`, 
           type: 'reaction',
           timestamp: Date.now()
         };
         r.chat.push(reactMsg);
         if (r.chat.length > 100) r.chat.shift();
         io.to(roomId).emit('new_message', reactMsg);
      }
    });

    // YouTube Search
    socket.on('search_youtube', async (query, callback) => {
      try {
        const r = await ytSearch(query);
        const videos = r.videos.slice(0, 10).map(v => ({
          title: v.title,
          url: v.url,
          thumbnail: v.thumbnail,
          duration: v.timestamp
        }));
        callback({ success: true, videos });
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('get_yt_subtitles', async (videoId, callback) => {
      try {
         const captions = await getSubtitles({ videoID: videoId, lang: 'en' });
         callback({ success: true, captions });
      } catch (err) {
         callback({ success: false, error: err.message });
      }
    });

    socket.on('search_subtitles', async (query, callback) => {
      try {
         const fetchRes = await fetch(`https://rest.opensubtitles.org/search/query-${encodeURIComponent(query)}/sublanguageid-eng`, {
            headers: { 'User-Agent': 'TemporaryUserAgent' }
         });
         const data = await fetchRes.json();
         
         const protocol = socket.handshake.headers['x-forwarded-proto'] || 'http';
         const host = socket.handshake.headers.host || 'localhost:3001';
         const backendUrl = `${protocol}://${host}`;
         
         const results = data.slice(0, 15).map(sub => ({
            title: sub.SubFileName,
            url: `${backendUrl}/proxy/subtitle?url=${encodeURIComponent(sub.SubDownloadLink)}`
         }));
         callback({ success: true, results });
      } catch (err) {
         callback({ success: false, error: err.message });
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
