import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useState, useEffect } from 'react';

export function Updater() {
  const [updateStatus, setUpdateStatus] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    checkForUpdates();
  }, []);

  async function checkForUpdates() {
    try {
      const update = await check({
         timeout: 30000,
        headers: { Authorization: 'Bearer token' }
      });
      
      if (update) {
        setUpdateStatus(`Actualización encontrada: v${update.version}`);
        console.log(`Notas: ${update.body}`);
        
        // Descargar e instalar
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              setUpdateStatus(`Descargando ${event.data.contentLength} bytes...`);
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              setProgress((downloaded / event.data.contentLength) * 100);
              break;
            case 'Finished':
              setUpdateStatus('¡Descarga completada!');
              break;
          }
        });

        await relaunch();
      } else {
        setUpdateStatus('Ya tienes la última versión');
      }
    } catch (error) {
      console.error('Error al verificar actualizaciones:', error);
      setUpdateStatus('Error al verificar actualizaciones');
    }
  }

  return (
    <div>
      <h2>Actualizaciones</h2>
      <p>{updateStatus}</p>
      {progress > 0 && (
        <progress value={progress} max="100" />
      )}
    </div>
  );
}