import { useEffect, useState, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const PENDING_UPDATE_KEY = 'pending_update_version';

function CheckUpdates() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  const performUpdate = useCallback(async (updateToInstall: Update) => {
    try {
      setInstalling(true);
      await updateToInstall.downloadAndInstall();
      // Limpiar la bandera después de instalar exitosamente
      localStorage.removeItem(PENDING_UPDATE_KEY);
      await relaunch();
    } catch (error) {
      console.error('Error al instalar:', error);
      setInstalling(false);
    }
  }, []);

  const checkUpdate = useCallback(async () => {
    try {
      const result = await check();

      if (result) {
        // Verificar si esta versión estaba pendiente de actualización
        const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);

        if (pendingVersion === result.version) {
          // Actualizar automáticamente
          console.log(`Auto-actualizando a versión ${result.version} (pendiente de cierre anterior)`);
          await performUpdate(result);
          return;
        }

        setUpdate((current) => {
          if (!current || current.version !== result.version) {
            return result;
          }
          return current;
        });
      }
    } catch (error) {
      console.error('Updater error:', error);
    }
  }, [performUpdate]);

  useEffect(() => {
    // Verificar al cargar la app
    void checkUpdate();

    const handleFocus = () => {
      void checkUpdate();
    };

    const interval = setInterval(() => {
      void checkUpdate();
    }, 60000);

    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkUpdate]);

  // Verificar actualización pendiente al montar el componente
  useEffect(() => {
    const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
    if (pendingVersion) {
      console.log(`Actualización pendiente detectada: v${pendingVersion}`);
    }
  }, []);

  if (installing) {
    return (
      <div style={styles.container}>
        <span style={styles.installingText}>⚙️ Instalando actualización...</span>
      </div>
    );
  }

  if (!update) {
    return null;
  }

  const handleInstall = () => {
    void performUpdate(update);
  };

  const handleClose = () => {
    // Guardar la versión pendiente para actualizar en el próximo inicio
    localStorage.setItem(PENDING_UPDATE_KEY, update.version);
    setUpdate(null);
  };

  const handleCancelPending = () => {
    // Cancelar completamente la actualización pendiente
    localStorage.removeItem(PENDING_UPDATE_KEY);
    setUpdate(null);
  };

  // Verificar si hay una actualización pendiente guardada
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
            <button
              style={styles.primaryButton}
              onClick={handleInstall}
            >
              Actualizar ahora
            </button>
            <button
              style={styles.secondaryButton}
              onClick={handleCancelPending}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              style={styles.primaryButton}
              onClick={handleInstall}
            >
              Actualizar
            </button>
            <button
              style={styles.secondaryButton}
              onClick={handleClose}
              title="Se actualizará automáticamente al reiniciar la aplicación"
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
    padding: '16px',
    borderRadius: 12,
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    minWidth: 300,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    border: '1px solid #ffffff15',
    zIndex: 9999,
    animation: 'slideUp 0.3s ease-out'
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
    fontWeight: 600,
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
    justifyContent: 'center'
  },
  buttonGroup: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end'
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
    transition: 'background 0.2s'
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

export default CheckUpdates;