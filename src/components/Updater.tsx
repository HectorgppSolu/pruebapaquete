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
  const isInitialCheckDoneRef = useRef(false);
  const updateRef = useRef<Update | null>(null);

  // Instalar silenciosamente al abrir la app
  const installSilentlyOnStartup = useCallback(async (updateToInstall: Update) => {
    try {
      console.log('🔄 Instalando actualización pendiente al iniciar...');
      setInstalling(true);
      await updateToInstall.downloadAndInstall();
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      console.log('✅ Instalación completada, reiniciando...');
      await relaunch();
    } catch (error) {
      console.error('❌ Error al instalar:', error);
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      setInstalling(false);
    }
  }, []);

  // Descargar en background (sin instalar)
  const downloadInBackground = useCallback(async (updateToDownload: Update) => {
    if (isDownloadingRef.current) {
      console.log('⏳ Descarga ya en progreso...');
      return;
    }

    try {
      isDownloadingRef.current = true;
      setDownloading(true);
      console.log(`📥 Descargando v${updateToDownload.version} en background...`);

      await updateToDownload.download((event) => {
        switch (event.event) {
          case 'Started':
            console.log(`📦 Iniciando descarga (${event.data.contentLength} bytes)`);
            break;
          case 'Progress':
            // Silencioso
            break;
          case 'Finished':
            console.log(`✅ Descarga completada: v${updateToDownload.version}`);
            localStorage.setItem(UPDATE_DOWNLOADED_KEY, 'true');
            localStorage.setItem(PENDING_UPDATE_KEY, updateToDownload.version);
            setDownloaded(true);
            setDownloading(false);
            break;
        }
      });
    } catch (error) {
      console.error('❌ Error descargando:', error);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      setDownloading(false);
    } finally {
      isDownloadingRef.current = false;
    }
  }, []);

  // Instalar cuando el usuario hace clic en "Actualizar ahora"
  const performUpdateNow = useCallback(async (updateToInstall: Update) => {
    try {
      console.log('🔄 Usuario solicitó instalar ahora...');
      setShowNotification(false);
      setInstalling(true);
      await updateToInstall.downloadAndInstall();
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
      console.log('✅ Instalación completada, reiniciando...');
      await relaunch();
    } catch (error) {
      console.error('❌ Error al instalar:', error);
      setInstalling(false);
      setShowNotification(true);
    }
  }, []);

  const checkUpdate = useCallback(async () => {
    if (isCheckingRef.current) return;

    try {
      isCheckingRef.current = true;
      console.log('🔍 Verificando actualizaciones...');
      const result = await check();

      if (result) {
        console.log(`📢 Actualización encontrada: v${result.version}`);
        const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
        const isDownloaded = localStorage.getItem(UPDATE_DOWNLOADED_KEY) === 'true';

        // CASO 1: Al ABRIR la app - Si hay pendiente descargada → instalar silenciosamente
        if (!isInitialCheckDoneRef.current && pendingVersion && isDownloaded) {
          console.log('🚀 Instalación silenciosa al iniciar...');
          await installSilentlyOnStartup(result);
          return;
        }

        // CASO 2: App YA ABIERTA - Guardar y mostrar notificación
        if (isInitialCheckDoneRef.current) {
          console.log('📱 App ya abierta - Mostrando notificación');
          
          // Guardar como pendiente
          localStorage.setItem(PENDING_UPDATE_KEY, result.version);
          updateRef.current = result;
          
          // Mostrar notificación
          setUpdate(result);
          setShowNotification(true);
          
          // Iniciar descarga en background
          if (!isDownloaded || pendingVersion !== result.version) {
            void downloadInBackground(result);
          }
        }
      } else {
        console.log('✅ No hay actualizaciones disponibles');
        // Limpiar banderas si no hay actualización
        if (localStorage.getItem(PENDING_UPDATE_KEY)) {
          localStorage.removeItem(PENDING_UPDATE_KEY);
          localStorage.removeItem(UPDATE_DOWNLOADED_KEY);
        }
      }
    } catch (error) {
      console.error('❌ Error verificando:', error);
    } finally {
      isCheckingRef.current = false;
      isInitialCheckDoneRef.current = true;
    }
  }, [installSilentlyOnStartup, downloadInBackground]);

  // Verificar periódicamente (solo después del inicio)
  useEffect(() => {
    let mounted = true;

    const handleFocus = () => {
      if (mounted && isInitialCheckDoneRef.current) {
        console.log('🪟 Ventana enfocada');
        void checkUpdate();
      }
    };

    const interval = setInterval(() => {
      if (mounted && isInitialCheckDoneRef.current) {
        console.log('⏰ Verificación periódica');
        void checkUpdate();
      }
    }, 60000); // Cada minuto

    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkUpdate]);

  // Verificación inicial al montar
  useEffect(() => {
    const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
    const isDownloaded = localStorage.getItem(UPDATE_DOWNLOADED_KEY) === 'true';
    
    console.log('🎬 App iniciada');
    console.log(`   - Versión pendiente: ${pendingVersion || 'ninguna'}`);
    console.log(`   - Descargada: ${isDownloaded ? 'sí' : 'no'}`);

    // Pequeño delay para asegurar que todo esté listo
    const timeoutId = setTimeout(() => {
      void checkUpdate();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [checkUpdate]);

  // Auto-ocultar notificación después de 30 segundos si el usuario no interactúa
  useEffect(() => {
    if (!showNotification || !update || installing) return;

    console.log('⏱️ Iniciando timer de auto-ocultación (30s)');
    const timer = setTimeout(() => {
      console.log('🔕 Notificación auto-ocultada - La descarga continúa');
      setShowNotification(false);
    }, 30000);

    return () => {
      console.log('⏱️ Limpiando timer');
      clearTimeout(timer);
    };
  }, [showNotification, update, installing]);

  // ==================== RENDER ====================

  // Pantalla de instalación (se muestra tanto en inicio como cuando el usuario instala)
  if (installing) {
    return (
      <div style={styles.installingOverlay}>
        <div style={styles.installingContainer}>
          <div style={styles.installingSpinner}>⚙️</div>
          <h2 style={styles.installingTitle}>Instalando actualización</h2>
          <p style={styles.installingText}>La aplicación se reiniciará automáticamente</p>
          <div style={styles.progressBar}>
            <div style={styles.progressFill} />
          </div>
        </div>
      </div>
    );
  }

  // No mostrar notificación si no hay update o si no se debe mostrar
  if (!update || !showNotification) return null;

  const handleInstallNow = () => {
    console.log('👆 Usuario hizo clic en "Actualizar ahora"');
    void performUpdateNow(update);
  };

  const handleLater = () => {
    console.log('👆 Usuario hizo clic en "Después" - La descarga continúa');
    setShowNotification(false);
  };

  const getStatusIcon = () => {
    if (downloaded) return '✅';
    if (downloading) return '📥';
    return '🚀';
  };

  const getTitle = () => {
    if (downloaded) return '¡Actualización lista!';
    if (downloading) return 'Descargando actualización...';
    return 'Nueva versión disponible';
  };

  const getStatusText = () => {
    if (downloaded) return 'Se instalará al reiniciar la aplicación';
    if (downloading) return 'Descargando en segundo plano...';
    return 'Iniciando descarga...';
  };

  return (
    <div style={styles.notificationContainer}>
      <div style={styles.notificationHeader}>
        <span style={styles.notificationIcon}>{getStatusIcon()}</span>
        <div style={styles.notificationText}>
          <span style={styles.notificationTitle}>{getTitle()}</span>
          <span style={styles.notificationVersion}>Versión {update.version}</span>
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
          Después
        </button>
      </div>
    </div>
  );
}

// ==================== ESTILOS ====================

const styles = {
  // Overlay de instalación
  installingOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(4px)'
  },
  installingContainer: {
    background: '#1a1a2e',
    padding: '40px',
    borderRadius: 16,
    textAlign: 'center' as const,
    minWidth: 320,
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.1)'
  },
  installingSpinner: {
    fontSize: 48,
    display: 'block',
    marginBottom: 16,
    animation: 'spin 2s linear infinite'
  },
  installingTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600' as const,
    marginBottom: 8
  },
  installingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 24
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

  // Notificación
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
  notificationIcon: {
    fontSize: 28,
    lineHeight: 1
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

// Agregar animaciones CSS
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
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
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