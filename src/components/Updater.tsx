import { useEffect, useState, useCallback, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const PENDING_UPDATE_KEY = 'pending_update_version';

function CheckUpdates() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [showNotification, setShowNotification] = useState(true);
  const isCheckingRef = useRef(false);
  const isDownloadingRef = useRef(false);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const downloadUpdate = useCallback(async (updateToDownload: Update) => {
    if (isDownloadingRef.current) return;
    
    try {
      isDownloadingRef.current = true;
      setDownloading(true);
      setShowNotification(true);
      
      console.log(`Descargando actualización ${updateToDownload.version} en segundo plano...`);
      await updateToDownload.download();
      
      console.log(`Actualización ${updateToDownload.version} descargada exitosamente`);
      setDownloaded(true);
      setDownloading(false);
      
      // Iniciar timer para ocultar notificación después de 30 segundos
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      
      notificationTimerRef.current = setTimeout(() => {
        console.log(`Notificación de actualización ${updateToDownload.version} expirada`);
        setShowNotification(false);
      }, 30000);
      
    } catch (error) {
      console.error('Error al descargar:', error);
      setDownloading(false);
    } finally {
      isDownloadingRef.current = false;
    }
  }, []);

  const performInstall = useCallback(async (updateToInstall: Update) => {
    try {
      setInstalling(true);
      await updateToInstall.install();
      localStorage.removeItem(PENDING_UPDATE_KEY);
      await relaunch();
    } catch (error) {
      console.error('Error al instalar:', error);
      setInstalling(false);
    }
  }, []);

  const checkUpdate = useCallback(async () => {
    if (isCheckingRef.current) return;
    
    try {
      isCheckingRef.current = true;
      const result = await check();

      if (result) {
        const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);

        // Si hay una versión pendiente que coincide, instalar directamente sin preguntar
        if (pendingVersion === result.version) {
          console.log(`Instalando actualización pendiente ${result.version} automáticamente`);
          await performInstall(result);
          return;
        }

        // Si es una nueva versión, guardarla como pendiente
        localStorage.setItem(PENDING_UPDATE_KEY, result.version);
        
        setUpdate((current) => {
          if (!current || current.version !== result.version) {
            // Iniciar descarga automática en segundo plano
            void downloadUpdate(result);
            return result;
          }
          return current;
        });
      }
    } catch (error) {
      console.error('Updater error:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, [downloadUpdate, performInstall]);

  // Verificar actualizaciones periódicamente y en focus
  useEffect(() => {
    let mounted = true;

    const handleFocus = () => {
      if (mounted) {
        void checkUpdate();
      }
    };

    const interval = setInterval(() => {
      if (mounted) {
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

  // Verificar actualización inicial
  useEffect(() => {
    const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
    
    if (pendingVersion) {
      console.log(`Actualización pendiente detectada: v${pendingVersion} - Se instalará automáticamente`);
    }

    const timeoutId = setTimeout(() => {
      void checkUpdate();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, [checkUpdate]);

  if (installing) {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <span style={styles.icon}>⚙️</span>
          <div style={styles.textContainer}>
            <span style={styles.title}>Instalando actualización...</span>
            <span style={styles.version}>La aplicación se reiniciará automáticamente</span>
          </div>
        </div>
        <div style={styles.progressContainer}>
          <div style={{ ...styles.progressBar, width: '100%', backgroundColor: '#10b981' }} />
        </div>
      </div>
    );
  }

  if (!update || !showNotification) {
    return null;
  }

  const handleInstallNow = () => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    void performInstall(update);
  };

  const handleClose = () => {
    // El usuario cierra la notificación manualmente
    // La actualización ya está marcada como pendiente y se instalará al reiniciar
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    console.log(`Usuario cerró la notificación. La actualización ${update.version} se instalará al reiniciar`);
    setShowNotification(false);
  };

  const getStatusMessage = () => {
    if (downloading) return 'Descargando en segundo plano...';
    if (downloaded) return '✅ Descargada - Lista para instalar';
    return 'Preparando descarga...';
  };

  const getStatusColor = () => {
    if (downloaded) return '#10b981';
    if (downloading) return '#f59e0b';
    return '#94a3b8';
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <span style={styles.icon}>
          {downloaded ? '✅' : downloading ? '📥' : '🚀'}
        </span>
        <div style={styles.textContainer}>
          <span style={styles.title}>
            {downloaded ? 'Actualización lista' : downloading ? 'Descargando actualización' : 'Nueva versión disponible'}
          </span>
          <span style={styles.version}>Versión {update.version}</span>
          <span style={{ ...styles.status, color: getStatusColor() }}>
            {getStatusMessage()}
          </span>
        </div>
      </div>

      {/* Barra de progreso */}
      <div style={styles.progressContainer}>
        <div 
          style={{
            ...styles.progressBar,
            width: downloaded ? '100%' : downloading ? '60%' : '10%',
            backgroundColor: getStatusColor(),
          }} 
        />
      </div>

      <div style={styles.buttonGroup}>
        <button
          style={{
            ...styles.primaryButton,
            opacity: downloaded ? 1 : 0.7,
            cursor: downloaded ? 'pointer' : 'not-allowed'
          }}
          onClick={handleInstallNow}
          disabled={!downloaded}
          title={downloaded ? 'Instalar y reiniciar ahora' : 'Espere a que termine la descarga'}
        >
          {downloaded ? 'Actualizar ahora' : 'Descargando...'}
        </button>
        <button
          style={styles.secondaryButton}
          onClick={handleClose}
          title="La actualización se instalará automáticamente al reiniciar la aplicación"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed' as const,
    bottom: 20,
    right: 20,
    background: '#111827',
    color: '#fff',
    padding: '16px',
    borderRadius: 12,
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    minWidth: 340,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    border: '1px solid #ffffff15',
    zIndex: 9999,
    animation: 'slideUp 0.3s ease-out'
  },
  content: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12
  },
  icon: {
    fontSize: 24,
    marginTop: 2
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    flex: 1
  },
  title: {
    fontWeight: 600,
    fontSize: 13,
    lineHeight: '1.2'
  },
  version: {
    fontSize: 11,
    color: '#94a3b8'
  },
  status: {
    fontSize: 10,
    fontStyle: 'italic' as const,
    marginTop: 2
  },
  progressContainer: {
    width: '100%',
    height: 3,
    backgroundColor: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.5s ease-in-out, background-color 0.3s ease'
  },
  buttonGroup: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 4
  },
  primaryButton: {
    background: '#2563eb',
    border: 'none',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    transition: 'all 0.2s'
  },
  secondaryButton: {
    background: 'transparent',
    border: '1px solid #ffffff22',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12,
    transition: 'all 0.2s'
  }
};

// Agregar animación CSS
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
  `;
  document.head.appendChild(styleSheet);
}

export default CheckUpdates;