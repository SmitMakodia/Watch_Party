import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { MousePointer2, 
  Play, Pause, Maximize, Minimize, 
  RotateCcw, RotateCw, Settings, Search, Smile, Volume2, VolumeX,
  Link, Youtube, Send, Subtitles, Upload, MessageCircle, Square, RefreshCw, Loader2
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

export default function Player({ socket, roomState, roomId, currentUserId, onToggleChat }) {
  const [inputMode, setInputMode] = useState('url'); 
  const [urlInput, setUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showCaptionsMenu, setShowCaptionsMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showChatEmoji, setShowChatEmoji] = useState(false); const [directControls, setDirectControls] = useState(false);
  
  const [currentMedia, setCurrentMedia] = useState(roomState?.media?.url || '');
  const [playing, setPlaying] = useState(roomState?.playback?.playing || false);
  const [playbackRate, setPlaybackRate] = useState(roomState?.playback?.speed || 1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  
  // Progress Bar State
  const [playedSeconds, setPlayedSeconds] = useState(roomState?.playback?.time || 0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  
  const [reactions, setReactions] = useState([]);
  const [floatingMessages, setFloatingMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // Subtitles
  const [subtitleUrl, setSubtitleUrl] = useState('');
  const [subtitleSize, setSubtitleSize] = useState('1.2rem');
  const [subtitlePos, setSubtitlePos] = useState('80%');
  const [showSubSearch, setShowSubSearch] = useState(false);
  const [subSearchQuery, setSubSearchQuery] = useState('');
  const [subSearchResults, setSubSearchResults] = useState([]);
  const [isSearchingSubs, setIsSearchingSubs] = useState(false);
  
  // YouTube specific
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState('auto');

  // Stop Timer
  const [stopTimer, setStopTimer] = useState(null);
  const [stopCountdown, setStopCountdown] = useState(0);
  
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const emojiRef = useRef(null);
  const chatEmojiRef = useRef(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    const handleMediaChanged = (media) => {
      setCurrentMedia(media.url);
      setPlayedSeconds(0);
      setPlaying(!!media.url);
    };

    const handlePlaybackSync = (state) => {
      const currentTime = playerRef.current ? playerRef.current.getCurrentTime() : 0;
      if (!seeking && Math.abs((currentTime || 0) - state.time) > 2) {
        playerRef.current?.seekTo(state.time, 'seconds');
        setPlayedSeconds(state.time);
      }
      setPlaying(state.playing);
      setPlaybackRate(state.speed);
    };

    const handleNewReaction = ({ sender, emoji }) => {
      const id = Date.now() + Math.random();
      // Spawn between 35% (15% left of center) and 65% (15% right of center)
      const offset = (Math.random() * 30) - 15; 
      setReactions(prev => [...prev, { id, emoji, sender, offset }]);
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id));
      }, 5000);
    };

    const handleNewMessage = (msg) => {
       if (msg.type !== 'reaction') {
          const id = Date.now() + Math.random();
          const flMsg = { ...msg, floatId: id };
          setFloatingMessages(prev => [...prev, flMsg]);
          setTimeout(() => {
             setFloatingMessages(prev => prev.filter(m => m.floatId !== id));
          }, 15000);
       }
    };

    socket.on('media_changed', handleMediaChanged);
    socket.on('playback_sync', handlePlaybackSync);
    socket.on('new_reaction', handleNewReaction);
    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('media_changed', handleMediaChanged);
      socket.off('playback_sync', handlePlaybackSync);
      socket.off('new_reaction', handleNewReaction);
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, seeking]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) setShowEmoji(false);
      if (chatEmojiRef.current && !chatEmojiRef.current.contains(event.target)) setShowChatEmoji(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      
      controlsTimeoutRef.current = setTimeout(() => {
        if (playing && !stopTimer) {
          setShowControls(false);
          closeAllMenus();
        }
      }, 5000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('touchstart', handleMouseMove, { passive: true });
      container.addEventListener('mouseleave', () => {
         if (playing && !stopTimer) setShowControls(false);
      });
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('touchstart', handleMouseMove);
        container.removeEventListener('mouseleave', () => {});
      }
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [playing, stopTimer]);

  useEffect(() => {
     if (stopTimer) {
        const interval = setInterval(() => {
           setStopCountdown(prev => {
              if (prev <= 1) {
                 clearInterval(interval);
                 confirmStop();
                 return 0;
              }
              return prev - 1;
           });
        }, 1000);
        return () => clearInterval(interval);
     }
  }, [stopTimer]);

  const closeAllMenus = () => {
     setShowSpeedMenu(false);
     setShowCaptionsMenu(false);
     setShowQualityMenu(false);
     setShowEmoji(false);
     setShowSubSearch(false);
  };

  const emitSystemMessage = (text) => {
     socket.emit('send_message', { text, type: 'system' });
  };

  const handleVideoClick = (e) => {
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if(directControls) return; if (!isTouch) {
       handlePlayPause();
    } else {
       const now = Date.now();
       const DOUBLE_CLICK_DELAY = 300;
       if (now - lastTapRef.current < DOUBLE_CLICK_DELAY) {
          handlePlayPause();
       } else {
          setShowControls(true);
       }
       lastTapRef.current = now;
    }
  };

  const handlePlayPause = () => {
    if (!currentMedia) return;
    const newPlaying = !playing;
    setPlaying(newPlaying);
    socket.emit('sync_playback', { 
      playing: newPlaying, 
      time: playerRef.current?.getCurrentTime() || 0,
      speed: playbackRate 
    });
  };

  const handleSeek = (amount) => {
    const currentTime = playerRef.current?.getCurrentTime() || 0;
    const newTime = Math.max(0, Math.min(currentTime + amount, duration));
    playerRef.current?.seekTo(newTime, 'seconds');
    setPlayedSeconds(newTime);
    socket.emit('sync_playback', { 
      playing, 
      time: newTime,
      speed: playbackRate 
    });
  };

  const handleProgress = (state) => {
     if (!seeking) {
        setPlayedSeconds(state.playedSeconds);
     }
  };

  const handleSeekMouseUp = (e) => {
     setSeeking(false);
     playerRef.current?.seekTo(parseFloat(e.target.value), 'seconds');
     socket.emit('sync_playback', { 
       playing, 
       time: parseFloat(e.target.value),
       speed: playbackRate 
     });
  };

  const requestSync = () => {
     socket.emit('request_sync');
     emitSystemMessage('requested a manual sync');
  };

  const formatTime = (seconds) => {
     if (isNaN(seconds)) return '00:00';
     const date = new Date(seconds * 1000);
     const hh = date.getUTCHours();
     const mm = date.getUTCMinutes();
     const ss = date.getUTCSeconds().toString().padStart(2, '0');
     if (hh) {
       return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
     }
     return `${mm}:${ss}`;
  };

  const handleKeyDown = (e) => {
     if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; if(directControls) return;
     if (e.key === ' ') {
        e.preventDefault();
        handlePlayPause();
     } else if (e.key === 'ArrowRight') {
        handleSeek(10);
     } else if (e.key === 'ArrowLeft') {
        handleSeek(-10);
     }
  };

  useEffect(() => {
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playing, playbackRate, duration, currentMedia]);

  const setSpeed = (newRate) => {
    setPlaybackRate(newRate);
    setShowSpeedMenu(false);
    socket.emit('sync_playback', { 
      playing, 
      time: playerRef.current?.getCurrentTime() || 0,
      speed: newRate 
    });
  };

  const initiateStop = () => {
     setStopCountdown(10);
     setStopTimer(true);
     setShowControls(true);
     setPlaying(false); // Pause locally
  };

  const cancelStop = () => {
     setStopTimer(null);
     setPlaying(true);
  };

  const confirmStop = () => {
     setStopTimer(null);
     socket.emit('change_media', { url: '', title: '' });
     emitSystemMessage(`stopped the media.`);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => console.error(err));
    } else {
      if (document.exitFullscreen) {
         document.exitFullscreen();
      }
    }
  };

  const handleChangeMedia = (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    socket.emit('change_media', { url: urlInput, title: 'Direct URL' });
    emitSystemMessage(`started playing ${urlInput}`);
    setUrlInput('');
  };

  const handleYoutubeSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    socket.emit('search_youtube', searchQuery, (response) => {
      if (response.success) {
        setSearchResults(response.videos);
      } else {
        alert('Search failed: ' + response.error);
      }
    });
  };

  const playYoutubeVideo = (video) => {
    socket.emit('change_media', { url: video.url, title: video.title });
    emitSystemMessage(`started playing YouTube video: ${video.title} - ${video.url}`);
    setSearchResults([]);
  };

  const sendChat = (e) => {
     if (e) e.preventDefault();
     if (!chatInput.trim()) return;
     socket.emit('send_message', { text: chatInput, type: 'text' });
     setChatInput('');
     setShowChatEmoji(false);
  };

  const handleSubtitleUpload = async (e) => {
     const file = e.target.files[0];
     if (file) {
        let url = URL.createObjectURL(file);
        setSubtitleUrl(url);
        setShowCaptionsMenu(false);
        emitSystemMessage(`loaded local subtitle file: ${file.name}`);
     }
  };

  const searchOnlineSubtitles = (e) => {
     e.preventDefault();
     setIsSearchingSubs(true);
     socket.emit('search_subtitles', subSearchQuery, (res) => {
        setIsSearchingSubs(false);
        if (res.success) {
           setSubSearchResults(res.results);
        } else {
           alert('Search failed.');
        }
     });
  };

  const onReady = () => {
     if (playerRef.current && currentMedia && (currentMedia.includes('youtube.com') || currentMedia.includes('youtu.be'))) {
        const internalPlayer = playerRef.current.getInternalPlayer('youtube');
        if (internalPlayer && internalPlayer.getAvailableQualityLevels) {
           const levels = internalPlayer.getAvailableQualityLevels();
           if (levels && levels.length > 0) {
              setQualities(['auto', ...levels.filter(l => l !== 'auto')]);
           }
        }
     } else {
        setQualities([]);
     }
  };

  const changeQuality = (q) => {
     setCurrentQuality(q);
     setShowQualityMenu(false);
     if (playerRef.current) {
        const internalPlayer = playerRef.current.getInternalPlayer('youtube');
        if (internalPlayer && internalPlayer.setPlaybackQuality) {
           internalPlayer.setPlaybackQuality(q);
        }
     }
  };

  const formatText = (text, isSystem) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) => {
      if (part.match(urlRegex)) {
        const displayText = isSystem && part.length > 30 ? part.substring(0, 30) + '...' : part;
        return (
           <span 
              key={i} 
              onClick={() => { navigator.clipboard.writeText(part); alert('URL copied to clipboard!'); }}
              className={`${isSystem ? 'text-black font-bold cursor-pointer underline' : 'text-blue-400 hover:underline break-all cursor-pointer'}`}
           >
              {displayText}
           </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-full bg-amoled relative">
      {/* Dynamic Subtitle CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        video::cue {
          background-color: transparent !important;
          color: white !important;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8) !important;
          font-size: ${subtitleSize} !important;
          line-height: normal !important;
        }
        /* A trick to push subtitles up/down by changing margin */
        video::-webkit-media-text-track-display {
           transform: translateY(calc(-100% + ${subtitlePos})) !important;
        }
      `}} />

      {/* Top Bar - hidden when fullscreen and playing */}
      <div className={`p-2 bg-amoled-light border-b border-gray-800 flex items-start justify-between gap-2 z-10 transition-all ${isFullscreen && playing ? 'hidden' : 'flex'}`}>
        <div className="flex items-start gap-2">
          <div className="bg-gray-800 px-2 py-1 rounded-xl text-xs text-gray-300 font-medium whitespace-nowrap">
             Room: <span className="text-white font-bold ml-1">{roomId}</span>
          </div>
          <div className="flex bg-amoled rounded-xl p-0.5 shadow-inner">
             <button onClick={() => setInputMode('url')} className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors flex items-start gap-1 ${inputMode === 'url' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>
                <Link size={14}/> URL
             </button>
             <button onClick={() => setInputMode('youtube')} className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors flex items-start gap-1 ${inputMode === 'youtube' ? 'bg-red-600 text-white' : 'text-gray-400'}`}>
                <Youtube size={14}/> YT
             </button>
          </div>
        </div>

        <div className="flex-1 max-w-lg">
           {inputMode === 'url' ? (
             <form onSubmit={handleChangeMedia} className="flex gap-1">
               <input 
                 type="text" 
                 placeholder="Paste video URL..." 
                 value={urlInput}
                 onChange={(e) => setUrlInput(e.target.value)}
                 className="flex-1 bg-amoled-lighter border border-gray-700 rounded-xl p-1.5 text-xs text-white focus:outline-none focus:border-red-500"
               />
               <button type="submit" className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors">Play</button>
             </form>
           ) : (
             <div className="relative">
                <form onSubmit={handleYoutubeSearch} className="flex gap-1">
                  <input 
                    type="text" 
                    placeholder="Search YouTube..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-amoled-lighter border border-gray-700 rounded-xl p-1.5 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                  <button type="submit" className="bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-start gap-1">
                    <Search size={14}/>
                  </button>
                </form>
                {searchResults.length > 0 && (
                  <div className="absolute top-full right-0 mt-1 z-50 bg-amoled-light border border-gray-800 rounded-xl shadow-2xl max-h-[50vh] overflow-y-auto p-2 custom-scrollbar w-72">
                     <div className="flex justify-between items-start mb-2">
                        <h3 className="text-white font-semibold text-xs">Results</h3>
                        <button onClick={() => setSearchResults([])} className="text-gray-400 hover:text-white text-xs font-medium">Close</button>
                     </div>
                     <div className="flex flex-col gap-2">
                       {searchResults.map((vid, idx) => (
                         <div key={idx} onClick={() => playYoutubeVideo(vid)} className="flex gap-2 cursor-pointer group bg-amoled p-1.5 rounded-lg border border-gray-800 hover:border-red-500 transition-all">
                           <div className="relative w-24 aspect-video overflow-hidden rounded bg-black flex-shrink-0">
                             <img src={vid.thumbnail} alt={vid.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                             <span className="absolute bottom-0.5 right-0.5 bg-black/90 px-1 py-[1px] text-[10px] text-white rounded">{vid.duration}</span>
                           </div>
                           <h4 className="text-xs font-medium line-clamp-3 text-gray-300 group-hover:text-white leading-tight">{vid.title}</h4>
                         </div>
                       ))}
                     </div>
                  </div>
                )}
             </div>
           )}
        </div>
        
        {/* Mobile Chat Toggle */}
        <button onClick={onToggleChat} className="md:hidden p-1.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-white transition-colors">
           <MessageCircle size={18} />
        </button>
      </div>

      {/* Video Container */}
      <div 
        ref={containerRef}
        className="relative flex-1 bg-black flex items-center justify-center overflow-hidden"
      >
        <div className={`w-full h-full transition-transform duration-500 flex items-center justify-center ${showControls && currentMedia ? 'scale-[0.98]' : 'scale-100'}`} style={{ transformOrigin: 'top center', transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
          {currentMedia ? (
            <ReactPlayer 
              ref={playerRef}
              url={currentMedia}
              playing={playing && !stopTimer}
              playbackRate={playbackRate}
              volume={volume}
              muted={muted}
              onReady={onReady}
              onDuration={setDuration}
              onProgress={handleProgress}
              width="100%"
              height="100%"
              controls={directControls}
              className="absolute top-0 left-0" 
              style={{ pointerEvents: directControls ? 'auto' : 'none' }}
              config={{
                youtube: {
                  playerVars: { controls: directControls ? 1 : 0, disablekb: 1, modestbranding: 1, cc_load_policy: 1, iv_load_policy: 3 }
                },
                file: {
                   tracks: subtitleUrl ? [{ kind: 'subtitles', src: subtitleUrl, srcLang: 'en', default: true }] : [],
                   attributes: { crossOrigin: 'anonymous' }
                }
              }}
              />
              ) : (
              <div className="text-gray-600 flex flex-col items-start select-none pointer-events-none">
              <Play size={48} className="mb-2 opacity-20" />
              <p className="text-sm font-medium">Select media to start watching</p>
              </div>
              )}
              </div>


              {!directControls && <div className="absolute inset-0 z-0 cursor-pointer" onClick={handleVideoClick} />}

              {/* Stop Timer Overlay */}        {stopTimer && (
           <div className="absolute inset-0 z-40 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm">
              <h2 className="text-white text-2xl font-bold mb-6">Stopping in {stopCountdown}s</h2>
              <div className="flex gap-4">
                 <button onClick={cancelStop} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold transition-colors text-sm">
                    Resume Media
                 </button>
                 <button onClick={confirmStop} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors text-sm">
                    Stop Now
                 </button>
              </div>
           </div>
        )}

        {/* Subtitle Search Modal */}
        {showSubSearch && (
           <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                 <h2 className="text-white text-lg font-bold mb-4">Search Subtitles Online</h2>
                 <form onSubmit={searchOnlineSubtitles} className="flex gap-2 mb-4">
                    <input 
                       type="text" 
                       value={subSearchQuery}
                       onChange={e => setSubSearchQuery(e.target.value)}
                       placeholder="Movie or Show Name..."
                       className="flex-1 bg-amoled border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                    <button type="submit" disabled={isSearchingSubs} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded-xl text-white text-sm font-bold transition flex items-center justify-center min-w-[80px]">
                       {isSearchingSubs ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                    </button>
                 </form>
                 <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar mb-4">
                    {subSearchResults.length === 0 ? (
                       <p className="text-gray-500 text-xs text-center">Search for titles above.</p>
                    ) : (
                       subSearchResults.map((sub, i) => (
                          <button 
                             key={i}
                             onClick={() => { setSubtitleUrl(sub.url); setShowSubSearch(false); setShowCaptionsMenu(false); emitSystemMessage(`loaded subtitle ${sub.title}`); }}
                             className="text-left bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-xs text-white transition truncate"
                          >
                             {sub.title}
                          </button>
                       ))
                    )}
                 </div>
                 <button onClick={() => setShowSubSearch(false)} className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-white text-sm font-bold transition">Close</button>
              </div>
           </div>
        )}

        {/* WhatsApp Style Floating Chat (Left Side) */}
        <div className="absolute bottom-28 left-4 z-20 w-72 max-w-[80vw] flex flex-col justify-end gap-1.5 pointer-events-none overflow-hidden h-[40vh]">
           {floatingMessages.map(m => {
              if (m.type === 'system') {
                 return (
                    <div key={m.floatId} className="animate-[chatSlideUp_0.3s_ease-out_forwards] flex flex-col bg-yellow-400 text-black px-3 py-2 rounded-xl shadow-lg pointer-events-auto self-start w-fit max-w-full">
                       <span className="text-[11px] font-bold">{m.sender?.name || 'System'}</span>
                       <span className="text-xs font-medium whitespace-pre-wrap break-words leading-tight">
                          {formatText(m.text, true)}
                       </span>
                    </div>
                 );
              }
              return (
                 <div key={m.floatId} className="animate-[chatSlideUp_0.3s_ease-out_forwards] flex flex-col bg-black/60 backdrop-blur-md px-3 py-2 rounded-2xl border border-gray-700 shadow-lg pointer-events-auto self-start w-fit max-w-full">
                    <div className="flex items-start gap-1.5 mb-0.5">
                       <img src={m.sender?.avatar} alt="" className="w-4 h-4 rounded-full bg-gray-800 object-cover" />
                       <span className="text-[11px] font-bold" style={{ color: m.sender?.color }}>{m.sender?.name || 'Unknown'}</span>
                    </div>
                    <span className="text-xs font-medium text-white whitespace-pre-wrap break-words leading-tight">
                       {formatText(m.text, false)}
                    </span>
                 </div>
              );
           })}
        </div>

        {/* Reaction Waterfall (Bottom Center +/- 15%) */}
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 w-1/3 h-[60vh] flex flex-col items-start justify-end pointer-events-none overflow-hidden">
          {reactions.map(r => (
            <div 
               key={r.id} 
               className="absolute bottom-0 animate-[floatUp_5s_ease-out_forwards] flex flex-col items-start gap-0.5"
               style={{ left: `calc(50% + ${r.offset}%)` }}
            >
              <span className="text-4xl drop-shadow-2xl">{r.emoji}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm shadow-md" style={{ color: r.sender?.color || '#fff' }}>
                 {r.sender?.name || 'Anonymous'}
              </span>
            </div>
          ))}
        </div>

        {/* Media Controls Bar (Bottom) */}
        <div 
           className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col justify-end p-2 md:p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'} ${stopTimer ? 'pointer-events-none opacity-0' : ''}`}
           onMouseEnter={() => setShowControls(true)}
        >
          <div className="w-full max-w-6xl mx-auto flex flex-col gap-2 z-30 pointer-events-auto">
            
            {/* Progress Bar & Sync */}
            <div className="flex items-center gap-3 w-full px-2">
               <span className="text-xs text-white font-medium w-10 text-right">{formatTime(playedSeconds)}</span>
               <input 
                  type="range"
                  min={0}
                  max={duration || 1}
                  step="any"
                  value={playedSeconds}
                  onMouseDown={() => setSeeking(true)}
                  onTouchStart={() => setSeeking(true)}
                  onChange={(e) => setPlayedSeconds(parseFloat(e.target.value))}
                  onMouseUp={handleSeekMouseUp}
                  onTouchEnd={handleSeekMouseUp}
                  className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500 hover:h-2 transition-all duration-200"
                  style={{ background: `linear-gradient(to right, #ef4444 ${(playedSeconds / (duration || 1)) * 100}%, #374151 ${(playedSeconds / (duration || 1)) * 100}%)` }}
               />
               <span className="text-xs text-gray-400 font-medium w-10">{formatTime(duration)}</span>
               <button onClick={requestSync} className="flex items-start gap-1 ml-2 px-2 py-1 bg-red-600/80 hover:bg-red-600 rounded-lg text-[10px] font-bold text-white transition-colors">
                  <RefreshCw size={10} /> Sync Now
               </button>
            </div>

            <div className="flex flex-col md:flex-row items-start justify-between gap-4 mt-2">
               
               {/* 0. Chat Section (Left Most) */}
               <div className="flex w-full md:w-72 relative items-center bg-gray-800 rounded-[12px] h-10 px-1 shadow-inner flex-shrink-0 mb-2 md:mb-0">
                  <button onClick={() => { closeAllMenus(); setShowChatEmoji(!showChatEmoji); }} className="text-gray-400 hover:text-yellow-400 p-1.5 transition-colors">
                     <Smile size={18} />
                  </button>
                  <textarea
                     value={chatInput}
                     onChange={e => setChatInput(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
                           e.preventDefault();
                           sendChat();
                        }
                     }}
                     placeholder="Type a message..."
                     rows={1}
                     className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none px-1 text-xs font-medium"
                  />
                  <button onClick={sendChat} className="p-1.5 text-red-500 hover:text-red-400 transition-colors">
                     <Send size={16} />
                  </button>

                  {/* Chat Emoji Popup at root of control bar */}
                  {showChatEmoji && (
                     <div className="absolute bottom-[44px] left-0 z-50">
                       <EmojiPicker theme="dark" onEmojiClick={(e) => { setChatInput(p => p + e.emoji); }} height={350} width={300} />
                     </div>
                  )}
               </div>

               {/* Right Side Buttons - Flex wrap on small screens to avoid clipping */}
               <div className="flex items-center justify-center flex-wrap gap-2 md:gap-3 w-full md:w-auto relative">
                  
                  {/* 1. Play/Pause */}
                  <button onClick={handlePlayPause} className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-[12px] transition-colors shadow-md">
                    {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                  </button>

                  {/* Stop Button */}
                  <button onClick={initiateStop} className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-red-500 rounded-[12px] transition-colors shadow-md">
                    <Square size={16} fill="currentColor" />
                  </button>

                  {/* 2. Seek Backward */}
                  <button onClick={() => handleSeek(-10)} className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-[12px] transition-colors shadow-md">
                    <RotateCcw size={18} />
                  </button>

                  {/* 3. Seek Forward */}
                  <button onClick={() => handleSeek(10)} className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-[12px] transition-colors shadow-md">
                    <RotateCw size={18} />
                  </button>

                  {/* 4. Reaction Emoji */}
                  <div className="relative static-on-mobile">
                     <button onClick={() => { closeAllMenus(); setShowEmoji(!showEmoji); }} className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-yellow-400 rounded-[12px] transition-colors shadow-md">
                       <Smile size={18} />
                     </button>
                  </div>

                  {/* 5. Volume (Toggle Only) */}
                  <button onClick={() => setMuted(!muted)} className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-[12px] shadow-md transition-colors">
                     {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>

                  {/* Direct Controls Toggle */}
                  <div className="relative static-on-mobile">
                     <button 
                        onClick={() => { closeAllMenus(); setDirectControls(!directControls); }} 
                        title="Toggle Direct Video Interaction" 
                        className={`h-10 px-2 min-w-[3rem] flex-shrink-0 flex items-center justify-center gap-1 font-bold text-[10px] uppercase rounded-[12px] transition-colors shadow-md ${directControls ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                     >
                        <MousePointer2 size={14} /> {directControls ? 'ON' : 'OFF'}
                     </button>
                  </div>
                  {/* 6. Speed */}
                  <div className="relative static-on-mobile">
                     <button 
                        onClick={() => { closeAllMenus(); setShowSpeedMenu(!showSpeedMenu); }} 
                        className="h-10 px-2 min-w-[3rem] flex-shrink-0 flex items-center justify-center gap-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-bold text-xs rounded-[12px] transition-colors shadow-md"
                     >
                       <Settings size={14} /> {playbackRate}x
                     </button>
                  </div>

                  {/* Resolution Picker (YT Only) */}
                  {qualities.length > 0 && (
                     <div className="relative static-on-mobile">
                        <button 
                           onClick={() => { closeAllMenus(); setShowQualityMenu(!showQualityMenu); }} 
                           className="h-10 px-2 min-w-[3rem] flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-bold text-[10px] uppercase rounded-[12px] transition-colors shadow-md"
                        >
                          {currentQuality === 'auto' ? 'Auto' : currentQuality.replace('p', '')}
                        </button>
                     </div>
                  )}

                  {/* 7. Captions */}
                  <div className="relative static-on-mobile">
                     <button 
                        onClick={() => { closeAllMenus(); setShowCaptionsMenu(!showCaptionsMenu); }}
                        className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-[12px] transition-colors shadow-md"
                     >
                        <Subtitles size={18} />
                     </button>
                  </div>

                  {/* 8. Fullscreen */}
                  <button onClick={toggleFullscreen} className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white hover:text-red-500 rounded-[12px] transition-colors shadow-md">
                    {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                  </button>
                  
                  {/* Fixed Popups container for small screens so they don't clip */}
                  {showEmoji && (
                     <div className="absolute bottom-[44px] left-1/2 -translate-x-1/2 z-50">
                       <EmojiPicker theme="dark" onEmojiClick={(e) => { socket.emit('send_reaction', e.emoji); }} height={350} width={280} />
                     </div>
                  )}
                  {showSpeedMenu && (
                     <div className="absolute bottom-[44px] right-24 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-1.5 flex flex-col gap-1 w-20">
                        {[0.5, 1, 1.25, 1.5, 2].map(speed => (
                           <button 
                             key={speed} 
                             onClick={() => setSpeed(speed)}
                             className={`px-3 py-1.5 text-xs rounded-lg text-left hover:bg-gray-800 font-medium ${playbackRate === speed ? 'text-red-500 bg-gray-800' : 'text-gray-300'}`}
                           >
                             {speed}x
                           </button>
                        ))}
                     </div>
                  )}
                  {showQualityMenu && (
                     <div className="absolute bottom-[44px] right-24 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-1.5 flex flex-col gap-1 w-24 max-h-48 overflow-y-auto custom-scrollbar">
                        {qualities.map(q => (
                           <button 
                             key={q} 
                             onClick={() => changeQuality(q)}
                             className={`px-3 py-1.5 text-xs rounded-lg text-left hover:bg-gray-800 font-medium ${currentQuality === q ? 'text-red-500 bg-gray-800' : 'text-gray-300'}`}
                           >
                             {q}
                           </button>
                        ))}
                     </div>
                  )}
                  {showCaptionsMenu && (
                     <div className="absolute bottom-[44px] right-0 md:right-12 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-4 flex flex-col gap-3 w-64 text-sm">
                        <h4 className="text-white font-bold mb-1">Subtitles</h4>
                        
                        <button onClick={() => { setSubtitleUrl(''); setShowCaptionsMenu(false); emitSystemMessage('turned off captions'); }} className="text-left text-red-400 hover:text-red-300 font-medium">
                           Turn Off Captions
                        </button>
                        
                        <div className="border-t border-gray-800"></div>
                        
                        <button onClick={() => { setShowSubSearch(true); setShowCaptionsMenu(false); }} className="text-left text-blue-400 hover:text-blue-300 font-medium flex items-start gap-2">
                           <Search size={14} /> Search Online
                        </button>
                        
                        <label className="flex items-start gap-2 text-green-400 hover:text-green-300 font-medium cursor-pointer">
                           <Upload size={14} /> Load Local File
                           <input type="file" accept=".vtt,.srt" className="hidden" onChange={handleSubtitleUpload} />
                        </label>
                        
                        <div className="border-t border-gray-800 mt-2"></div>
                        <h4 className="text-gray-400 text-xs font-semibold mb-1">Settings</h4>
                        
                        <div className="flex justify-between items-start text-xs text-gray-300">
                           <span>Size:</span>
                           <div className="flex gap-2 bg-gray-800 rounded p-1">
                              <button onClick={() => setSubtitleSize('1rem')} className={`px-2 py-1 rounded ${subtitleSize === '1rem' ? 'bg-gray-700 text-white' : ''}`}>S</button>
                              <button onClick={() => setSubtitleSize('1.5rem')} className={`px-2 py-1 rounded ${subtitleSize === '1.5rem' ? 'bg-gray-700 text-white' : ''}`}>M</button>
                              <button onClick={() => setSubtitleSize('2rem')} className={`px-2 py-1 rounded ${subtitleSize === '2rem' ? 'bg-gray-700 text-white' : ''}`}>L</button>
                           </div>
                        </div>

                        <div className="flex justify-between items-start text-xs text-gray-300">
                           <span>Position:</span>
                           <div className="flex gap-2 bg-gray-800 rounded p-1">
                              <button onClick={() => setSubtitlePos('10%')} className={`px-2 py-1 rounded ${subtitlePos === '10%' ? 'bg-gray-700 text-white' : ''}`}>Top</button>
                              <button onClick={() => setSubtitlePos('50%')} className={`px-2 py-1 rounded ${subtitlePos === '50%' ? 'bg-gray-700 text-white' : ''}`}>Mid</button>
                              <button onClick={() => setSubtitlePos('80%')} className={`px-2 py-1 rounded ${subtitlePos === '80%' ? 'bg-gray-700 text-white' : ''}`}>Bot</button>
                           </div>
                        </div>

                     </div>
                  )}

               </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes chatSlideUp {
          0% { transform: translateY(15px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes floatUp {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          10% { opacity: 1; scale: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(-300px) scale(1.2); opacity: 0; }
        }
        @media (max-width: 768px) {
           .static-on-mobile { position: static !important; }
        }
        /* Custom styling to hide native track styling backgrounds and apply nice shadow */
        ::cue {
          background: transparent !important;
          color: white !important;
          text-shadow: 2px 2px 4px black, -1px -1px 2px black !important;
        }
      `}} />
    </div>
  );
}
