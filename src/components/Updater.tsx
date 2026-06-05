import { useEffect, useState, useCallback, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

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
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Instala silenciosamente (para usar al reabrir)
  const installSilently = useCallback(async (updateToInstall: Update) => {
    try {
      setInstalling(true);
      await updateToInstall.downloadAndInstall();
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      await relaunch();
    } catch (error) {
      console.error('Error al instalar silenciosamente:', error);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      setInstalling(false);
    }
  }, []);

  // Descarga en background
  const downloadInBackground = useCallback(async (updateToDownload: Update) => {
    if (isDownloadingRef.current) return;

    try {
      isDownloadingRef.current = true;
      setDownloading(true);
      console.log(`Descargando actualización v${updateToDownload.version} en background...`);

      await updateToDownload.download((event) => {
        switch (event.event) {
          case 'Started':
            console.log(`Descarga iniciada - Tamaño total: ${event.data.contentLength ?? 'desconocido'}`);
            break;
          case 'Progress':
            console.log(`Progreso de descarga: +${event.data.chunkLength} bytes`);
            break;
          case 'Finished':
            console.log(`Descarga completada: v${updateToDownload.version}`);
            localStorage.setItem(UPDATE_DOWNLOADED_KEY, 'true');
            localStorage.setItem(PENDING_UPDATE_KEY, updateToDownload.version);
            setDownloaded(true);
            setDownloading(false);
            
            // Si el usuario no ha visto la notificación, mostrarla ahora que está descargada
            if (!showNotification) {
              setShowNotification(true);
            }
            break;
        }
      });
    } catch (error) {
      console.error('Error descargando en background:', error);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      setDownloading(false);
    } finally {
      isDownloadingRef.current = false;
    }
  }, [showNotification]);

  const performUpdate = useCallback(async (updateToInstall: Update) => {
    try {
      setInstalling(true);
      await updateToInstall.downloadAndInstall();
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
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
      console.log('Verificando actualizaciones...');
      const result = await check();

      if (result) {
        console.log('Actualización encontrada:', result.version);
        const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
        const isDownloaded = localStorage.getItem(UPDATE_DOWNLOADED_KEY) === 'true';

        // Si ya fue descargada en sesión anterior → instalar directo sin mostrar notificación
        if (pendingVersion === result.version && isDownloaded) {
          console.log(`Instalando actualización pendiente v${result.version} automáticamente...`);
          await installSilently(result);
          return;
        }

        // Actualizar el estado con la nueva actualización
        setUpdate((current) => {
          if (!current || current.version !== result.version) {
            // SIEMPRE mostrar la notificación cuando hay una nueva actualización
            setShowNotification(true);
            
            // Iniciar descarga en background si no está descargada
            if (!isDownloaded || pendingVersion !== result.version) {
              void downloadInBackground(result);
            }
            
            return result;
          }
          return current;
        });
      } else {
        console.log('No hay actualizaciones disponibles');
      }
    } catch (error) {
      console.error('Updater error:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, [installSilently, downloadInBackground]);

  // Verificar periódicamente y en focus
  useEffect(() => {
    let mounted = true;

    const handleFocus = () => {
      if (mounted) {
        console.log('Ventana enfocada - verificando actualizaciones');
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

  // Verificación inicial
  useEffect(() => {
    const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
    const isDownloaded = localStorage.getItem(UPDATE_DOWNLOADED_KEY) === 'true';
    
    if (pendingVersion) {
      console.log(`Actualización pendiente detectada: v${pendingVersion}${isDownloaded ? ' (descargada)' : ''}`);
    }

    const timeoutId = setTimeout(() => {
      void checkUpdate();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [checkUpdate]);

  // Mostrar instalación en progreso
  if (installing) {
    return (
      <div style={styles.container}>
        <div style={styles.installingContent}>
          <span style={styles.installingIcon}>⚙️</span>
          <div style={styles.installingTextContainer}>
            <span style={styles.installingTitle}>Instalando actualización...</span>
            <span style={styles.installingSubtitle}>La aplicación se reiniciará automáticamente</span>
          </div>
        </div>
      </div>
    );
  }

  // No mostrar nada si no hay actualización o si no se debe mostrar notificación
  if (!update || !showNotification) return null;

  const handleInstall = () => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    void performUpdate(update);
  };

  const handleClose = () => {
    console.log('Usuario cerró la notificación');
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setShowNotification(false);
  };

  const handleCancelPending = () => {
    console.log('Usuario canceló la actualización pendiente');
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    localStorage.removeItem(PENDING_UPDATE_KEY);
    localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
    isDownloadingRef.current = false;
    setShowNotification(false);
    setUpdate(null);
  };

  const isPendingFromPrevious = localStorage.getItem(PENDING_UPDATE_KEY) === update.version;
 

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.textContainer}>
          <span style={styles.title}>
            {downloaded 
              ? 'Actualización lista' 
              : downloading 
                ? 'Descargando actualización...' 
                : 'Nueva versión disponible'}
          </span>
          <span style={styles.version}>Versión {update.version}</span>
          {!downloaded && !isPendingFromPrevious && (
            <span style={styles.downloadHint}>
              La descarga se realiza en segundo plano
            </span>
          )}
        </div>
      </div>

      <div style={styles.buttonGroup}>
        <button 
          style={{
            ...styles.primaryButton,
            opacity: downloaded ? 1 : 0.7,
            cursor: downloaded ? 'pointer' : 'not-allowed'
          }}
          onClick={handleInstall}
          disabled={!downloaded}
          title={downloaded ? 'Instalar y reiniciar ahora' : 'Esperando descarga...'}
        >
          {downloaded ? 'Actualizar ahora' : downloading ? 'Descargando...' : 'Actualizar'}
        </button>
        <button
          style={styles.secondaryButton}
          onClick={isPendingFromPrevious ? handleCancelPending : handleClose}
          title={isPendingFromPrevious 
            ? 'Cancelar actualización pendiente' 
            : 'La actualización se instalará automáticamente al reiniciar'}
        >
          {isPendingFromPrevious ? 'Cancelar' : 'Cerrar'}
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
    minWidth: 320,
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
    fontWeight: '600' as const,
    fontSize: 13,
    lineHeight: '1.2'
  },
  version: {
    fontSize: 11,
    color: '#94a3b8'
  },
  downloadHint: {
    fontSize: 10,
    color: '#64748b',
    fontStyle: 'italic' as const,
    marginTop: 2
  },
  installingContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%'
  },
  installingIcon: {
    fontSize: 24
  },
  installingTextContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    flex: 1
  },
  installingTitle: {
    fontWeight: '600' as const,
    fontSize: 13
  },
  installingSubtitle: {
    fontSize: 11,
    color: '#94a3b8'
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
    fontWeight: '500' as const,
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