/**
 * Service Worker 注册服务
 * 负责管理 Service Worker 的生命周期
 */
export class ServiceWorkerRegister {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private version = '1.0.0';

  /**
   * 注册 Service Worker
   */
  async register(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[SW] Service Workers are not supported in this browser');
      return null;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[SW] Running in development mode, skipping registration');
      return null;
    }

    try {
      // 注意：实际路径需要根据构建输出调整
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        // @ts-ignore - updateViaCache is not in TypeScript types yet
        updateViaCache: 'none'
      });

      console.log('[SW] Service Worker registered:', registration.scope);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] New version available, refresh to update');
              this.onUpdateAvailable?.();
            }
          });
        }
      });

      this.swRegistration = registration;
      return registration;
    } catch (error) {
      console.error('[SW] Service Worker registration failed:', error);
      return null;
    }
  }

  /**
   * 注销 Service Worker
   */
  async unregister(): Promise<boolean> {
    if (!this.swRegistration) return true;

    try {
      const result = await this.swRegistration.unregister();
      console.log('[SW] Service Worker unregistered:', result);
      this.swRegistration = null;
      return result;
    } catch (error) {
      console.error('[SW] Failed to unregister:', error);
      return false;
    }
  }

  /**
   * 发送消息到 Service Worker
   */
  async postMessage(message: any): Promise<void> {
    if (!navigator.serviceWorker.controller) {
      console.warn('[SW] No service worker controller');
      return;
    }

    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        if (event.data.error) {
          reject(event.data.error);
        } else {
          resolve();
        }
      };

      navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
    });
  }

  /**
   * 获取当前注册
   */
  getRegistration(): ServiceWorkerRegistration | null {
    return this.swRegistration;
  }

  /**
   * 检查更新
   */
  async checkForUpdate(): Promise<boolean> {
    if (!this.swRegistration) return false;

    try {
      await this.swRegistration.update();
      return true;
    } catch (error) {
      console.error('[SW] Failed to check for updates:', error);
      return false;
    }
  }

  // 回调函数
  onUpdateAvailable?: () => void;
  onUpdateReady?: () => void;
}

export const swRegister = new ServiceWorkerRegister();
