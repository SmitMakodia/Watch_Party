import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Player from './components/Player';
import Chat from './components/Chat';
import { RefreshCw, Upload } from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const ALL_COLORS = ['#fde047', '#ffffff', '#f9a8d4', '#86efac', '#fca5a5', '#93c5fd', '#d8b4fe', '#c4b5fd', '#fcd34d', '#fdba74'];

function App() {
  const [socket, setSocket] = useState(null);
  const [joined, setJoined] = useState(false);
  const [roomState, setRoomState] = useState(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  
  // Lobby State
  const [roomId, setRoomId] = useState(localStorage.getItem('wp_roomId') || '');
  const [name, setName] = useState(localStorage.getItem('wp_name') || '');
  const [avatarInput, setAvatarInput] = useState(localStorage.getItem('wp_avatar') || '');
  const [seed, setSeed] = useState(localStorage.getItem('wp_seed') || Math.random().toString(36).substring(7));
  const [selectedColor, setSelectedColor] = useState(localStorage.getItem('wp_color') || ALL_COLORS[0]);
  const [usedColors, setUsedColors] = useState([]);

  // Connect early just for lobby info
  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);
    return () => s.disconnect();
  }, []);

  useEffect(() => {
    if (socket && roomId.trim() && !joined) {
      socket.emit('get_used_colors', roomId, (colors) => {
        setUsedColors(colors);
        if (colors.includes(selectedColor)) {
          const firstAvail = ALL_COLORS.find(c => !colors.includes(c));
          if (firstAvail) setSelectedColor(firstAvail);
        }
      });
    }
  }, [socket, roomId, joined, selectedColor]);

  // Determine actual avatar URL
  const avatarUrl = avatarInput.trim().startsWith('data:image') || avatarInput.trim().startsWith('http') 
      ? avatarInput 
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;

  const handleJoin = (e) => {
    e.preventDefault();
    if (!roomId.trim() || !name.trim()) return;

    localStorage.setItem('wp_roomId', roomId);
    localStorage.setItem('wp_name', name);
    localStorage.setItem('wp_avatar', avatarInput);
    localStorage.setItem('wp_seed', seed);
    localStorage.setItem('wp_color', selectedColor);

    socket.emit('join_room', { roomId, user: { name, avatar: avatarUrl, color: selectedColor } });
    setJoined(true);

    socket.on('room_state', (state) => setRoomState(state));
    socket.on('user_joined', (user) => setRoomState(prev => prev ? { ...prev, users: [...prev.users, user] } : prev));
    socket.on('users_update', (users) => setRoomState(prev => prev ? { ...prev, users } : prev));
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarInput(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const randomizeAvatar = () => {
    setSeed(Math.random().toString(36).substring(7));
    setAvatarInput(''); // Clear custom upload if randomized
  };

  if (!joined || !roomState) {
    return (
      <div className="min-h-screen bg-amoled flex items-center justify-center p-4">
        <div className="bg-amoled-light p-8 rounded-3xl shadow-2xl border border-gray-800 w-full max-w-md">
          <h1 className="text-3xl font-bold mb-8 text-center text-white tracking-wider">Watch<span className="text-red-500">Party</span></h1>
          
          <div className="flex flex-col items-center mb-6 gap-4">
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-gray-700 shadow-lg cursor-pointer" onClick={randomizeAvatar} title="Click to randomize">
               <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover bg-gray-800 transition-transform hover:scale-110 duration-300" />
               <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                  <RefreshCw size={24} className="text-white" />
               </div>
            </div>
            
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm font-medium rounded-lg cursor-pointer transition text-gray-200">
               <Upload size={16} /> Upload Custom
               <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </label>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Room ID</label>
              <input 
                type="text" 
                value={roomId} 
                onChange={e => setRoomId(e.target.value)}
                className="w-full bg-amoled-lighter border border-gray-700 rounded-xl p-3.5 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                placeholder="Enter or create a room..."
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Your Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)}
                className="w-full bg-amoled-lighter border border-gray-700 rounded-xl p-3.5 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                placeholder="What should we call you?"
                required
              />
            </div>
            
            <div>
               <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Theme Color</label>
               <div className="flex flex-wrap gap-2">
                  {ALL_COLORS.map(c => {
                     const isUsed = usedColors.includes(c) && selectedColor !== c;
                     return (
                        <button
                           key={c}
                           type="button"
                           disabled={isUsed}
                           onClick={() => setSelectedColor(c)}
                           className={`w-8 h-8 rounded-full border-2 transition-all ${selectedColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'} ${isUsed ? 'opacity-20 cursor-not-allowed' : ''}`}
                           style={{ backgroundColor: c }}
                           title={isUsed ? 'Color taken' : 'Select color'}
                        />
                     )
                  })}
               </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-lg py-4 rounded-xl transition-all shadow-lg hover:shadow-red-900/50 mt-8"
            >
              Join Party
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-amoled flex flex-col md:flex-row overflow-hidden relative">
      {/* Main Video Area */}
      <div className="flex-1 flex flex-col h-full bg-amoled relative">
        <Player 
           socket={socket} 
           roomState={roomState} 
           roomId={roomId} 
           currentUserId={socket.id} 
           onToggleChat={() => setShowMobileChat(!showMobileChat)} 
        />
      </div>

      {/* Chat Sidebar */}
      <div className={`${showMobileChat ? 'flex' : 'hidden'} md:flex absolute md:relative z-40 right-0 top-0 w-80 max-w-[80vw] h-full border-l border-gray-800 flex-col bg-amoled-light flex-shrink-0 shadow-2xl md:shadow-none`}>
        <Chat socket={socket} roomState={roomState} currentUserId={socket.id} onClose={() => setShowMobileChat(false)} />
      </div>
      
      {/* Mobile Chat Overlay */}
      {showMobileChat && (
        <div className="md:hidden absolute inset-0 z-30 bg-black/50" onClick={() => setShowMobileChat(false)} />
      )}
    </div>
  );
}

export default App;
