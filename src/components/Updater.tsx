import { useEffect, useState, useCallback, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// Cambia esta ruta por la ubicacion de tu video
import updateVideo from '../assets/video.webm';

const PENDING_UPDATE_KEY = 'pending_update_version';
const UPDATE_DOWNLOADED_KEY = 'update_downloaded';

function CheckUpdates() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const isCheckingRef = useRef(false);
  const isDownloadingRef = useRef(false);
  const isInitialCheckDoneRef = useRef(false);
  const updateRef = useRef<Update | null>(null);

  const installSilentlyOnStartup = useCallback(async (updateToInstall: Update) => {
    try {
      console.log('Instalando actualizacion pendiente al iniciar...');
      setInstalling(true);
      await updateToInstall.downloadAndInstall();
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      console.log('Instalacion completada, reiniciando...');
      await relaunch();
    } catch (error) {
      console.error('Error al instalar:', error);
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      setInstalling(false);
    }
  }, []);

  const downloadInBackground = useCallback(async (updateToDownload: Update) => {
    if (isDownloadingRef.current) {
      console.log('Descarga ya en progreso...');
      return;
    }

    try {
      isDownloadingRef.current = true;
      setDownloading(true);
      console.log(`Descargando v${updateToDownload.version} en background...`);

      await updateToDownload.download((event) => {
        switch (event.event) {
          case 'Started':
            console.log(`Iniciando descarga (${event.data.contentLength} bytes)`);
            break;
          case 'Progress':
            break;
          case 'Finished':
            console.log(`Descarga completada: v${updateToDownload.version}`);
            localStorage.setItem(UPDATE_DOWNLOADED_KEY, 'true');
            localStorage.setItem(PENDING_UPDATE_KEY, updateToDownload.version);
            setDownloaded(true);
            setDownloading(false);
            break;
        }
      });
    } catch (error) {
      console.error('Error descargando:', error);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      setDownloading(false);
    } finally {
      isDownloadingRef.current = false;
    }
  }, []);

  const performUpdateNow = useCallback(async (updateToInstall: Update) => {
    try {
      console.log('Usuario solicito instalar ahora...');
      setShowNotification(false);
      setInstalling(true);
      await updateToInstall.downloadAndInstall();
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      console.log('Instalacion completada, reiniciando...');
      await relaunch();
    } catch (error) {
      console.error('Error al instalar:', error);
      setInstalling(false);
      setShowNotification(true);
    }
  }, []);

  const checkUpdate = useCallback(async () => {
    if (isCheckingRef.current) return;

    try {
      isCheckingRef.current = true;
      console.log('Verificando actualizaciones...');
      const result = await check();

      if (result) {
        console.log(`Actualizacion encontrada: v${result.version}`);
        const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
        const isDownloaded = localStorage.getItem(UPDATE_DOWNLOADED_KEY) === 'true';

        if (!isInitialCheckDoneRef.current && pendingVersion && isDownloaded) {
          console.log('Instalacion silenciosa al iniciar...');
          await installSilentlyOnStartup(result);
          return;
        }

        if (isInitialCheckDoneRef.current) {
          console.log('App ya abierta - Mostrando notificacion');
          
          localStorage.setItem(PENDING_UPDATE_KEY, result.version);
          updateRef.current = result;
          
          setUpdate(result);
          setShowNotification(true);
          
          if (!isDownloaded || pendingVersion !== result.version) {
            void downloadInBackground(result);
          }
        }
      } else {
        console.log('No hay actualizaciones disponibles');
        if (localStorage.getItem(PENDING_UPDATE_KEY)) {
          localStorage.removeItem(PENDING_UPDATE_KEY);
          localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
        }
      }
    } catch (error) {
      console.error('Error verificando:', error);
    } finally {
      isCheckingRef.current = false;
      isInitialCheckDoneRef.current = true;
    }
  }, [installSilentlyOnStartup, downloadInBackground]);

  useEffect(() => {
    let mounted = true;

    const handleFocus = () => {
      if (mounted && isInitialCheckDoneRef.current) {
        console.log('Ventana enfocada');
        void checkUpdate();
      }
    };

    const interval = setInterval(() => {
      if (mounted && isInitialCheckDoneRef.current) {
        console.log('Verificacion periodica');
        void checkUpdate();
      }
    }, 60000);

    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkUpdate]);

  useEffect(() => {
    const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
    const isDownloaded = localStorage.getItem(UPDATE_DOWNLOADED_KEY) === 'true';
    
    console.log('App iniciada');
    console.log(`   - Version pendiente: ${pendingVersion || 'ninguna'}`);
    console.log(`   - Descargada: ${isDownloaded ? 'si' : 'no'}`);

    const timeoutId = setTimeout(() => {
      void checkUpdate();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [checkUpdate]);

  useEffect(() => {
    if (!showNotification || !update || installing) return;

    console.log('Iniciando timer de auto-ocultacion (30s)');
    const timer = setTimeout(() => {
      console.log('Notificacion auto-ocultada - La descarga continua');
      setShowNotification(false);
    }, 30000);

    return () => {
      console.log('Limpiando timer');
      clearTimeout(timer);
    };
  }, [showNotification, update, installing]);

  if (installing) {
    return (
      <div style={styles.installingOverlay}>
        <div style={styles.installingContainer}>
          <div style={styles.videoContainer}>
            <video
              src={updateVideo}
              autoPlay
              loop
              muted
              playsInline
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              style={styles.video}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
          <h2 style={styles.installingTitle}>Instalando actualizacion</h2>
          <p style={styles.installingText}>La aplicacion se reiniciara automaticamente</p>
          <div style={styles.progressBar}>
            <div style={styles.progressFill} />
          </div>
        </div>
      </div>
    );
  }

  if (!update || !showNotification) return null;

  const handleInstallNow = () => {
    console.log('Usuario hizo clic en "Actualizar ahora"');
    void performUpdateNow(update);
  };

  const handleLater = () => {
    console.log('Usuario hizo clic en "Despues" - La descarga continua');
    setShowNotification(false);
  };

  const getTitle = () => {
    if (downloaded) return 'Actualizacion lista';
    if (downloading) return 'Descargando actualizacion...';
    return 'Nueva version disponible';
  };

  const getStatusText = () => {
    if (downloaded) return 'Se instalara al reiniciar la aplicacion';
    if (downloading) return 'Descargando en segundo plano...';
    return 'Iniciando descarga...';
  };

  return (
    <div style={styles.notificationContainer}>
      <div style={styles.notificationHeader}>
        <div style={styles.notificationText}>
          <span style={styles.notificationTitle}>{getTitle()}</span>
          <span style={styles.notificationVersion}>Version {update.version}</span>
        </div>
      </div>

      <div style={styles.notificationStatus}>
        <span style={styles.statusDot} />
        <span style={styles.statusText}>{getStatusText()}</span>
      </div>

      <div style={styles.notificationActions}>
        <button
          style={{
            ...styles.primaryButton,
            opacity: downloaded ? 1 : 0.6,
            cursor: downloaded ? 'pointer' : 'not-allowed'
          }}
          onClick={handleInstallNow}
          disabled={!downloaded}
        >
          Actualizar ahora
        </button>
        <button
          style={styles.secondaryButton}
          onClick={handleLater}
        >
          Despues
        </button>
      </div>
    </div>
  );
}

const styles = {
  installingOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(8px)'
  },
  installingContainer: {
    background: '#1a1a2e',
    padding: '48px',
    borderRadius: 20,
    textAlign: 'center' as const,
    minWidth: 360,
    maxWidth: 440,
    boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
    border: '1px solid rgba(255,255,255,0.08)'
  },
  videoContainer: {
    width: 120,
    height: 120,
    margin: '0 auto 24px',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0f0f23',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    border: '2px solid rgba(255,255,255,0.1)'
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  },
  installingTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600' as const,
    marginBottom: 8,
    letterSpacing: '-0.3px'
  },
  installingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 32,
    lineHeight: '1.5'
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#2d2d4a',
    borderRadius: 2,
    overflow: 'hidden'
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#10b981',
    animation: 'progress 2s ease-in-out infinite'
  },
  notificationContainer: {
    position: 'fixed' as const,
    bottom: 24,
    right: 24,
    background: '#111827',
    color: '#fff',
    padding: '20px',
    borderRadius: 16,
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
    minWidth: 360,
    maxWidth: 400,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
    zIndex: 9998,
    animation: 'slideUp 0.3s ease-out',
    backdropFilter: 'blur(10px)'
  },
  notificationHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12
  },
  notificationText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    flex: 1
  },
  notificationTitle: {
    fontWeight: '600' as const,
    fontSize: 14,
    color: '#fff'
  },
  notificationVersion: {
    fontSize: 12,
    color: '#94a3b8'
  },
  notificationStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 8
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#10b981',
    animation: 'pulse 2s infinite'
  },
  statusText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic' as const
  },
  notificationActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end'
  },
  primaryButton: {
    background: '#2563eb',
    border: 'none',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: '500' as const,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap' as const
  },
  secondaryButton: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap' as const
  }
};

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    @keyframes progress {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default CheckUpdates;