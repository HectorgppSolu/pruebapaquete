import { useEffect, useState, useCallback, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const PENDING_UPDATE_KEY = 'pending_update_version';
const UPDATE_DOWNLOADED_KEY = 'update_downloaded';

function CheckUpdates() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const isCheckingRef = useRef(false);
  const isDownloadingRef = useRef(false);
  const downloadedUpdateRef = useRef<Update | null>(null);

  // Instala silenciosamente sin relaunch (para usar al reabrir)
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

  // Descarga en background sin mostrar nada al usuario
  const downloadInBackground = useCallback(async (updateToDownload: Update) => {
    if (isDownloadingRef.current) return;

    try {
      isDownloadingRef.current = true;
      console.log(`Descargando actualización v${updateToDownload.version} en background...`);

      // Descargar sin instalar — solo descarga los bytes
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
            downloadedUpdateRef.current = updateToDownload;
            break;
        }
      });
    } catch (error) {
      console.error('Error descargando en background:', error);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
    } finally {
      isDownloadingRef.current = false;
    }
  }, []);

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
      const result = await check();

      if (result) {
        const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
        const isDownloaded = localStorage.getItem(UPDATE_DOWNLOADED_KEY) === 'true';

        // Si ya fue descargada en sesión anterior → instalar directo
        if (pendingVersion === result.version && isDownloaded) {
          console.log(`Instalando actualización pendiente v${result.version}...`);
          await installSilently(result);
          return;
        }

        setUpdate((current) => {
          if (!current || current.version !== result.version) {
            // Iniciar descarga silenciosa en background
            if (!isDownloaded || pendingVersion !== result.version) {
              void downloadInBackground(result);
            }
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
  }, [installSilently, downloadInBackground]);

  // Verificar periódicamente y en focus
  useEffect(() => {
    let mounted = true;

    const handleFocus = () => {
      if (mounted) void checkUpdate();
    };

    const interval = setInterval(() => {
      if (mounted) void checkUpdate();
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
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [checkUpdate]);

  if (installing) {
    return (
      <div style={styles.container}>
        <span style={styles.installingText}>⚙️ Instalando actualización...</span>
      </div>
    );
  }

  if (!update) return null;

  const handleInstall = () => void performUpdate(update);

  const handleClose = () => {
    // Guardar versión pendiente — la descarga ya corre en background
    localStorage.setItem(PENDING_UPDATE_KEY, update.version);
    setUpdate(null);
  };

  const handleCancelPending = () => {
    localStorage.removeItem(PENDING_UPDATE_KEY);
    localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
    isDownloadingRef.current = false;
    setUpdate(null);
  };

  const isPendingFromPrevious = localStorage.getItem(PENDING_UPDATE_KEY) === update.version;

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <span style={styles.icon}>🚀</span>
        <div style={styles.textContainer}>
          <span style={styles.title}>
            {isPendingFromPrevious ? 'Actualización pendiente' : 'Nueva versión disponible'}
          </span>
          <span style={styles.version}>Versión {update.version}</span>
        </div>
      </div>

      <div style={styles.buttonGroup}>
        {isPendingFromPrevious ? (
          <>
            <button style={styles.primaryButton} onClick={handleInstall}>
              Actualizar ahora
            </button>
            <button style={styles.secondaryButton} onClick={handleCancelPending}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button style={styles.primaryButton} onClick={handleInstall}>
              Actualizar
            </button>
            <button
              style={styles.secondaryButton}
              onClick={handleClose}
              title="Se instalará automáticamente al reiniciar la aplicación"
            >
              Después
            </button>
          </>
        )}
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
    padding: '12px 16px',
    borderRadius: 12,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 300,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    border: '1px solid #ffffff15',
    zIndex: 9999
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  icon: {
    fontSize: 24
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2
  },
  title: {
    fontWeight: '600' as const,
    fontSize: 13
  },
  version: {
    fontSize: 11,
    color: '#94a3b8'
  },
  installingText: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center' as const
  },
  buttonGroup: {
    display: 'flex',
    gap: 8
  },
  primaryButton: {
    background: '#2563eb',
    border: 'none',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: '500' as const
  },
  secondaryButton: {
    background: 'transparent',
    border: '1px solid #ffffff22',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12
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