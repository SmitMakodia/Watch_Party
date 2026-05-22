import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';

const PATH_DIRECT = 'direct';
const PATH_PROXY = 'proxy';
const PATH_ERROR = 'error';

const CustomVideoPlayer = forwardRef(({
  url,
  playing,
  playbackRate,
  volume,
  muted,
  onReady,
  onPlay,
  onPause,
  onEnded,
  onError,
  onProgress,
  onDuration,
  serverUrl,
  subtitleUrl,
  className,
  style
}, ref) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const pathRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const hasStartedRef = useRef(false);
  const isDestroyedRef = useRef(false);

  const [currentPath, setCurrentPath] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);

  // Store all callbacks and config in refs to avoid useEffect re-runs
  const cbRef = useRef({ onReady, onPlay, onPause, onEnded, onError, onProgress, onDuration, serverUrl });
  useEffect(() => {
    cbRef.current = { onReady, onPlay, onPause, onEnded, onError, onProgress, onDuration, serverUrl };
  });

  const playingRef = useRef(playing);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  const getProxiedUrl = (u) => {
    if (!u || !serverUrl) return u;
    if (u.includes(serverUrl + '/proxy')) return u;
    return serverUrl + '/proxy?url=' + encodeURIComponent(u);
  };

  const clearFallbackTimer = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const startProgressTracking = () => {
    if (progressIntervalRef.current) return;
    progressIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      cbRef.current.onProgress?.({
        playedSeconds: video.currentTime || 0,
        loadedSeconds: video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0
      });
    }, 250);
  };

  const stopProgressTracking = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const destroyHls = () => {
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch (e) {}
      hlsRef.current = null;
    }
  };

  // Main effect: initialize player when URL changes ONLY
  useEffect(() => {
    isDestroyedRef.current = false;
    const video = videoRef.current;
    if (!video || !url) return;

    const lowerUrl = url.toLowerCase();
    const isHls = lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/');
    const isDash = lowerUrl.includes('.mpd');
    const isVideo = lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.mkv') || lowerUrl.includes('.mov');

    if (isHls || (!isDash && !isVideo)) {
      // Try HLS
      initHls(url, PATH_DIRECT);
    } else {
      // Direct video
      initNativeVideo(url);
    }

    return () => {
      isDestroyedRef.current = true;
      clearFallbackTimer();
      stopProgressTracking();
      destroyHls();
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const initNativeVideo = (targetUrl) => {
    const video = videoRef.current;
    if (!video) return;
    destroyHls();
    pathRef.current = PATH_DIRECT;
    setCurrentPath(PATH_DIRECT);
    setErrorInfo(null);
    video.src = targetUrl;
  };

  const initHls = (targetUrl, pathName) => {
    if (isDestroyedRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    destroyHls();
    pathRef.current = pathName;
    setCurrentPath(pathName);
    setErrorInfo(null);
    hasStartedRef.current = false;

    if (!Hls.isSupported()) {
      video.src = targetUrl;
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      xhrSetup: function(xhr, xhrUrl) {
        if (xhrUrl.startsWith('http') && serverUrl && !xhrUrl.includes(serverUrl + '/proxy')) {
          const proxyUrl = serverUrl + '/proxy?url=' + encodeURIComponent(xhrUrl);
          try {
            const responseType = xhr.responseType;
            const timeout = xhr.timeout;
            const withCredentials = xhr.withCredentials;
            xhr.open('GET', proxyUrl, true);
            if (responseType) xhr.responseType = responseType;
            if (timeout) xhr.timeout = timeout;
            if (withCredentials) xhr.withCredentials = withCredentials;
          } catch (err) {
            console.error('[HLS] xhrSetup error:', err);
          }
        }
      }
    });

    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      cbRef.current.onReady?.();
      if (playingRef.current && !isDestroyedRef.current) {
        video.play().catch(() => {});
      }
    });

    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      hasStartedRef.current = true;
      clearFallbackTimer();
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (!data.fatal) return;

      console.error('[CustomPlayer] Fatal HLS error:', data.type, data.details);

      if (pathRef.current === PATH_PROXY) {
        setErrorInfo({ type: data.type, details: data.details, message: data.error?.message || data.details, url: targetUrl });
        setCurrentPath(PATH_ERROR);
        cbRef.current.onError?.(new Error(data.details), data);
        return;
      }

      if (pathRef.current === PATH_DIRECT) {
        const proxied = getProxiedUrl(url);
        if (proxied !== url) {
          console.log('[CustomPlayer] Direct failed, trying proxy:', proxied.substring(0, 100));
          initHls(proxied, PATH_PROXY);
        } else {
          setErrorInfo({ type: data.type, details: data.details, message: data.error?.message, url: targetUrl });
          setCurrentPath(PATH_ERROR);
          cbRef.current.onError?.(new Error(data.details), data);
        }
      }
    });

    hls.attachMedia(video);
    hls.loadSource(targetUrl);

    clearFallbackTimer();
    fallbackTimerRef.current = setTimeout(() => {
      if (!hasStartedRef.current && pathRef.current === PATH_DIRECT) {
        const proxied = getProxiedUrl(url);
        if (proxied !== url) {
          console.log('[CustomPlayer] Timeout fallback to proxy');
          initHls(proxied, PATH_PROXY);
        }
      }
    }, 6000);
  };

  // Handle playing prop
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    if (playing) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playing, url]);

  // Handle playbackRate
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playbackRate;
  }, [playbackRate]);

  // Handle volume/muted
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.muted = muted;
    }
  }, [volume, muted]);

  // Handle subtitle
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    while (video.querySelector('track')) {
      video.querySelector('track').remove();
    }
    if (subtitleUrl) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.src = subtitleUrl;
      track.srclang = 'en';
      track.default = true;
      video.appendChild(track);
    }
  }, [subtitleUrl]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      hasStartedRef.current = true;
      clearFallbackTimer();
      startProgressTracking();
      cbRef.current.onPlay?.();
    };

    const handlePause = () => {
      stopProgressTracking();
      cbRef.current.onPause?.();
    };

    const handleEnded = () => {
      stopProgressTracking();
      cbRef.current.onEnded?.();
    };

    const handleDurationChange = () => {
      if (video.duration && isFinite(video.duration)) {
        cbRef.current.onDuration?.(video.duration);
      }
    };

    const handleLoadedMetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        cbRef.current.onDuration?.(video.duration);
      }
      cbRef.current.onReady?.();
    };

    const handleError = (e) => {
      if (!hlsRef.current) {
        cbRef.current.onError?.(video.error || e);
      }
    };

    const handleCanPlay = () => {
      hasStartedRef.current = true;
      clearFallbackTimer();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    getDuration: () => videoRef.current?.duration || 0,
    getInternalPlayer: () => videoRef.current,
    seekTo: (seconds) => {
      const video = videoRef.current;
      if (video) video.currentTime = seconds;
    },
    getCurrentPath: () => currentPath,
    getErrorInfo: () => errorInfo
  }), [currentPath, errorInfo]);

  const crossOrigin = subtitleUrl ? 'anonymous' : undefined;

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <video
        ref={videoRef}
        className="w-full h-full"
        style={{ display: 'block', background: '#000' }}
        playsInline
        muted={muted}
        crossOrigin={crossOrigin}
      />
      {currentPath === PATH_ERROR && errorInfo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-4 text-center z-10">
          <div>
            <p className="text-red-400 font-bold mb-2">Unable to play stream</p>
            <p className="text-sm text-gray-300 mb-2">{errorInfo.details}</p>
            <p className="text-xs text-gray-500 break-all max-w-md">{errorInfo.url}</p>
          </div>
        </div>
      )}
    </div>
  );
});

CustomVideoPlayer.displayName = 'CustomVideoPlayer';

export default CustomVideoPlayer;
