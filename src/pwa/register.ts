export type ServiceWorkerRegistrationStatus = 'REGISTERED' | 'UNSUPPORTED' | 'FAILED';

type WorkerContainer = Pick<ServiceWorkerContainer, 'register'>;

export async function registerServiceWorker(options: {
  readonly serviceWorker?: WorkerContainer;
  readonly baseUrl?: string;
} = {}): Promise<ServiceWorkerRegistrationStatus> {
  const serviceWorker = options.serviceWorker
    ?? (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : undefined);
  if (!serviceWorker) return 'UNSUPPORTED';

  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL;
  try {
    await serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl });
    return 'REGISTERED';
  } catch {
    return 'FAILED';
  }
}
