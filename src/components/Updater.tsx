import { useEffect, useState, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

function CheckUpdates() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  const checkUpdate = useCallback(async () => {
    try {
      const result = await check();

      if (result) {
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
  }, []);

  useEffect(() => {
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

  if (installing) {
    return (
      <div style={styles.container}>
        ⚙️ Instalando actualización...
      </div>
    );
  }

  if (!update) {
    return null;
  }

  const handleInstall = async () => {
    try {
      setInstalling(true);
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      console.error('Error al instalar:', error);
      setInstalling(false);
    }
  };

  return (
    <div style={styles.container}>
      <span>🚀 Nueva versión {update.version}</span>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={styles.primaryButton}
          onClick={() => {
            void handleInstall();
          }}
        >
          Actualizar
        </button>

        <button
          style={styles.closeButton}
          onClick={() => setUpdate(null)}
        >
          ✖
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
    padding: '12px 16px',
    borderRadius: 12,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 250,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    border: '1px solid #ffffff15',
    zIndex: 9999
  },
  primaryButton: {
    background: '#2563eb',
    border: 'none',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12
  },
  closeButton: {
    background: 'transparent',
    border: '1px solid #ffffff22',
    color: '#fff',
    padding: '6px 8px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12
  }
};

export default CheckUpdates;