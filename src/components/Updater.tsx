import { useEffect, useCallback, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export function Updater() {
  const [updateInfo, setUpdateInfo] = useState<string>('');
  
  const checkUpdate = useCallback(async () => {
    try {
      const update = await check();
      
      if (update) {
        setUpdateInfo(`¡Nueva versión disponible: ${update.version}!`);
        console.log(`Notas de actualización: ${update.body}`);
        
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log(`Descargando ${event.data.contentLength} bytes`);
              setUpdateInfo(`Descargando actualización...`);
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              break;
            case 'Finished':
              setUpdateInfo('¡Actualización instalada! Reiniciando...');
              break;
          }
        });
        
        await relaunch();
      }
    } catch (error) {
      console.error('Error verificando actualizaciones:', error);
    }
  }, []);

  useEffect(() => {
    // ✅ Llamar inmediatamente al montar
    void checkUpdate();

    // Verificar cuando la ventana obtiene foco
    const handleFocus = () => { void checkUpdate(); };
    
    // Verificar cada 60 segundos
    const interval = setInterval(() => { void checkUpdate(); }, 60000);

    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkUpdate]);

  return updateInfo ? <div className="updater-notification">{updateInfo}</div> : null;
}