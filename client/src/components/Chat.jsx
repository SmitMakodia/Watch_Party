import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Users, MessageSquare, Edit2, Check, X, XCircle } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

export default function Chat({ socket, roomState, currentUserId, onClose }) {
  const [messages, setMessages] = useState(roomState.chat || []);
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'users'
  const messagesEndRef = useRef(null);
  const emojiRef = useRef(null);

  // Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  useEffect(() => {
    const handleNewMessage = (msg) => {
      setMessages(prev => [...prev, msg]);
    };

    socket.on('new_message', handleNewMessage);
    return () => socket.off('new_message', handleNewMessage);
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    socket.emit('send_message', { text: input, type: 'text' });
    setInput('');
  };

  const onEmojiClick = (emojiData) => {
    setInput(prev => prev + emojiData.emoji);
    setShowEmoji(false);
  };

  const handleSaveProfile = () => {
    const updates = { name: editName, avatar: editAvatar };
    socket.emit('update_profile', updates);
    localStorage.setItem('wp_name', editName);
    localStorage.setItem('wp_avatar', editAvatar);
    setIsEditing(false);
  };

  const startEditing = (user) => {
    setEditName(user.name);
    setEditAvatar(user.avatar.includes('dicebear') ? '' : user.avatar);
    setIsEditing(true);
  };

  const formatText = (text, isSystem) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) => {
      if (part.match(urlRegex)) {
        const displayText = isSystem && part.length > 30 ? part.substring(0, 30) + '...' : part;
        return (
           <span 
              key={i} 
              onClick={() => { navigator.clipboard.writeText(part); alert('URL copied to clipboard!'); }}
              className={`${isSystem ? 'text-black font-bold cursor-pointer underline' : 'text-blue-400 hover:underline break-all'}`}
           >
              {displayText}
           </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-full bg-amoled-light relative w-full">
      {/* Mobile Close Button (visible only on small screens via App.jsx wrapping) */}
      {onClose && (
        <button onClick={onClose} className="md:hidden absolute top-2 right-2 text-gray-400 hover:text-white z-50 p-2">
          <XCircle size={24} />
        </button>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-800 pr-10 md:pr-0">
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition ${activeTab === 'chat' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400 hover:text-gray-200'}`}
        >
          <MessageSquare size={18} /> Chat
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition ${activeTab === 'users' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400 hover:text-gray-200'}`}
        >
          <Users size={18} /> Users ({roomState.users.length})
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'chat' ? (
          <div className="flex flex-col gap-4">
            {messages.map((msg, i) => {
              // System Message
              if (msg.type === 'system' || msg.type === 'reaction') {
                 return (
                    <div key={i} className="self-center bg-yellow-400 text-black px-4 py-2 rounded-xl text-xs font-medium my-1 max-w-[90%] text-center shadow-md">
                       <span style={{color: '#000'}} className="font-bold mr-1">{msg.sender.name}</span>
                       {formatText(msg.text, true)}
                    </div>
                 );
              }

              // Normal Chat
              const isMe = msg.sender.id === currentUserId;
              return (
                <div key={i} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <img src={msg.sender.avatar} alt={msg.sender.name} className="w-8 h-8 rounded-full bg-gray-800 flex-shrink-0" />
                  <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs mb-1 font-bold" style={{ color: msg.sender.color || '#9ca3af' }}>
                       {msg.sender.name}
                    </span>
                    <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-gray-800 text-white rounded-tr-none' : 'bg-amoled-lighter text-gray-200 rounded-tl-none border border-gray-800'}`}>
                      {formatText(msg.text, false)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {roomState.users.map(u => {
              const isMe = u.id === currentUserId;
              return (
                <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-amoled-lighter transition group">
                  <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full bg-gray-800 object-cover" style={{ border: `2px solid ${u.color}` }} />
                  <div className="flex-1">
                    {isEditing && isMe ? (
                      <div className="flex flex-col gap-2">
                        <input 
                          type="text" 
                          value={editName} 
                          onChange={e => setEditName(e.target.value)} 
                          className="bg-amoled border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-red-500 outline-none w-full"
                          placeholder="Name"
                        />
                        <input 
                          type="text" 
                          value={editAvatar} 
                          onChange={e => setEditAvatar(e.target.value)} 
                          className="bg-amoled border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-red-500 outline-none w-full"
                          placeholder="Avatar URL"
                        />
                        <div className="flex gap-2 mt-1">
                           <button onClick={handleSaveProfile} className="text-green-500 hover:text-green-400"><Check size={18} /></button>
                           <button onClick={() => setIsEditing(false)} className="text-red-500 hover:text-red-400"><X size={18} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                         <p className="text-sm font-bold" style={{ color: u.color }}>
                            {u.name} {isMe && <span className="text-xs text-gray-500 ml-1 font-normal">(You)</span>}
                         </p>
                         {isMe && !isEditing && (
                            <button onClick={() => startEditing(u)} className="text-gray-500 hover:text-white hidden group-hover:block transition">
                               <Edit2 size={14} />
                            </button>
                         )}
                      </div>
                    )}
                  </div>
                  {!isEditing && <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Input Area (Only for Chat Tab) */}
      {activeTab === 'chat' && (
        <div className="p-3 border-t border-gray-800 bg-amoled-light relative">
          {showEmoji && (
            <div ref={emojiRef} className="absolute bottom-full right-0 mb-2 z-50 shadow-2xl">
              <EmojiPicker theme="dark" onEmojiClick={onEmojiClick} />
            </div>
          )}
          <form onSubmit={sendMessage} className="flex gap-2 items-center bg-amoled border border-gray-700 rounded-2xl p-1 shadow-inner">
            <button 
              type="button" 
              onClick={() => setShowEmoji(!showEmoji)}
              className="text-gray-400 hover:text-yellow-400 transition p-2"
            >
              <Smile size={22} />
            </button>
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-transparent px-2 py-2 text-sm text-white focus:outline-none"
            />
            <button 
              type="submit"
              disabled={!input.trim()}
              className="text-red-500 hover:text-red-400 disabled:opacity-30 p-2 transition pr-3"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
