const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const ytSearch = require('yt-search');
const { getSubtitles } = require('youtube-captions-scraper');

const app = express();
app.use(cors());

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
         // Simulating an online subtitle search as public unauthenticated APIs are heavily rate-limited.
         // In a full production app, you would integrate subdl or OpenSubtitles REST API here with a key.
         const mockResults = [
            { title: `${query} - English (Synced)`, url: 'mock' },
            { title: `${query} - English (SDH)`, url: 'mock' }
         ];
         callback({ success: true, results: mockResults });
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
