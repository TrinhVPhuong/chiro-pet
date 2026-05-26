export const mockTauriApi = () => {
  if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
    console.warn('Initializing Mock Tauri APIs for Browser Environment...');
    
    // Mock the Tauri internals so that @tauri-apps/api doesn't crash
    (window as any).__TAURI_INTERNALS__ = {
      callbacks: {} as Record<number, Function>,
      transformCallback: function(callback: Function) {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        this.callbacks[id] = callback;
        return id;
      },
      invoke: async (cmd: string, args: any) => {
        console.log(`[MOCK TAURI INVOKE] Command: ${cmd}`, args);
        if (cmd === 'get_app_data_dir_path') {
          // Return null to force fallback to public/ in browser
          return null; 
        }
        return Promise.resolve();
      },
      convertFileSrc: (path: string) => {
        console.log(`[MOCK TAURI CONVERT] Path: ${path}`);
        return path;
      }
    };
    
    // Simple event bus to mock Tauri's event system
    const eventListeners: Record<string, Function[]> = {};

    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, _id: number) => {
        // Mock unregister
      }
    };

    // Override the core invoke to intercept events
    (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string, args: any) => {
      console.log(`[MOCK TAURI INVOKE] Command: ${cmd}`, args);
      
      if (cmd === 'get_app_data_dir_path') {
        return null; 
      }

      // Mock FS read file
      if (cmd === 'plugin:fs|read_text_file') {
        console.log('[MOCK FS READ] Fetching manifest locally...');
        try {
          const res = await fetch('/animation/manifest.json');
          return await res.text();
        } catch (e) {
          console.error(e);
          throw e;
        }
      }

      // Mock listen registration
      if (cmd === 'plugin:event|listen') {
        const { event, handler } = args;
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(handler);
        return Date.now(); // return dummy eventId
      }

      // Mock anim_play by firing the event
      if (cmd === 'anim_play') {
        const commandPayload = args.command;
        if (eventListeners['animation_command']) {
          eventListeners['animation_command'].forEach(handlerId => {
            try {
               const callback = (window as any).__TAURI_INTERNALS__.callbacks[handlerId as unknown as string];
               if (callback) {
                 // Emulate tauri event payload
                 callback({
                   event: 'animation_command',
                   payload: commandPayload
                 });
               }
            } catch (e) {
               console.error(e);
            }
          });
        }
      }

      return Promise.resolve();
    };

    (window as any).isTauri = false;
  }
};