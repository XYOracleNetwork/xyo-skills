# React Application Bootstrap

Read this when scaffolding a new React application from scratch (no existing `src/index.tsx` or `src/main.tsx`). This provides the standard entry point and service worker files that all XY React apps use.

**When to apply:** If you are creating a new React app (not adding to an existing one) and there is no `src/index.tsx` or `src/main.tsx` in the project, create all three files below before writing any application code.

---

## src/index.tsx

This is the application entry point. It mounts the React root and unregisters any stale service workers:

```tsx
import React from 'react'
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import * as serviceWorker from './serviceWorker.ts'

void serviceWorker.unregister()

const rootElement = document.querySelector('#root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

const root = createRoot(rootElement)

root.render(<App />)
```

**Notes:**
- The `eslint-disable` for `import-x/no-internal-modules` is required — `react-dom/client` is a sub-path import that the lint rule flags.
- The entry point in `index.html` must point to this file: `<script type="module" src="/src/index.tsx"></script>`
- Do not wrap in `<React.StrictMode>` unless the project explicitly requires it — some XYO/XL1 SDK integrations double-fire effects in strict mode.

---

## src/App.tsx

The root application component. This is a minimal shell — add providers, layout, and routing here as the app grows:

```tsx
import React from 'react'

export function App() {
  return (
    <div>
      <h1>App</h1>
    </div>
  )
}
```

**Notes:**
- Export `App` as a named export (not default) — this matches the `import { App }` in `index.tsx`.
- This is a starting point. Wrap it with providers (e.g., `InPageGatewaysProvider`, `GatewayProvider`, theme providers) as needed for the application's requirements.
- Do not add application logic directly to `App` — create child components and compose them here.

---

## src/serviceWorker.ts

Standard service worker registration/unregistration utility. Create this file verbatim:

```ts
// This optional code is used to register a service worker.
// register() is not called by default.

// This lets the app load faster on subsequent visits in production, and gives
// it offline capabilities. However, it also means that developers (and users)
// will only see deployed updates on subsequent visits to a page, after all the
// existing tabs open on the page have been closed, since previously cached
// resources are updated in the background.

// To learn more about the benefits of this model and instructions on how to
// opt-in, read https://bit.ly/CRA-PWA

const isLocalhost = () =>
  Boolean(
    globalThis.location.hostname === 'localhost'
    // [::1] is the IPv6 localhost address.
    || globalThis.location.hostname === '[::1]'
    // 127.0.0.0/8 are considered localhost for IPv4.
    || /^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})){3}$/.test(globalThis.location.hostname),
  )

interface Config {
  onSuccess?: (registration: ServiceWorkerRegistration) => void
  onUpdate?: (registration: ServiceWorkerRegistration) => void
}

function registerValidSW(swUrl: string, config?: Config): void {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.addEventListener('updatefound', (): void => {
        const installingWorker = registration.installing
        if (installingWorker == null) {
          return
        }
        installingWorker.addEventListener('statechange', (): void => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // At this point, the updated precached content has been fetched,
              // but the previous service worker will still serve the older
              // content until all client tabs are closed.
              console.log('New content is available and will be used when all ' + 'tabs for this page are closed. See https://bit.ly/CRA-PWA.')

              // Execute callback
              if (config && config.onUpdate) {
                config.onUpdate(registration)
              }
            } else {
              // At this point, everything has been precached.
              // It's the perfect time to display a
              // "Content is cached for offline use." message.
              console.log('Content is cached for offline use.')

              // Execute callback
              if (config && config.onSuccess) {
                config.onSuccess(registration)
              }
            }
          }
        })
      })
    })
    .catch((error) => {
      console.error('Error during service worker registration:', error)
    })
}

const checkValidServiceWorker = async (swUrl: string, config?: Config) => {
  // Check if the service worker can be found. If it can't reload the page.
  try {
    const response = await fetch(swUrl, { headers: { 'Service-Worker': 'script' } })

    // Ensure service worker exists, and that we really are getting a JS file.
    const contentType = response.headers.get('content-type')
    if (response.status === 404 || (contentType != null && !contentType.includes('javascript'))) {
      // No service worker found. Probably a different app. Reload the page.
      navigator.serviceWorker.ready
        .then((registration) => {
          registration
            .unregister()
            .then(() => {
              globalThis.location.reload()
            })
            .catch(() => {
              return
            })
        })
        .catch(() => {
          return
        })
    } else {
      // Service worker found. Proceed as normal.
      registerValidSW(swUrl, config)
    }
  } catch {
    console.log('No internet connection found. App is running in offline mode.')
  }
}

const onWindowLoad = async (config?: Config) => {
  const swUrl = `${import.meta.env.PUBLIC_URL}/service-worker.js`

  if (isLocalhost()) {
    // This is running on localhost. Let's check if a service worker still exists or not.
    await checkValidServiceWorker(swUrl, config)

    // Add some additional logging to localhost, pointing developers to the
    // service worker/PWA documentation.
    navigator.serviceWorker.ready
      .then(() => {
        console.log('This web app is being served cache-first by a service ' + 'worker. To learn more, visit https://bit.ly/CRA-PWA')
      })
      .catch(() => {
        return
      })
  } else {
    // Is not localhost. Just register service worker
    registerValidSW(swUrl, config)
  }
}

export const register = (config?: Config) => {
  console.log('Register service worker')
  if (import.meta.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    // The URL constructor is available in all browsers that support SW.
    const publicUrl = new URL(import.meta.env.PUBLIC_URL ?? '', globalThis.location.href)
    if (publicUrl.origin !== globalThis.location.origin) {
      // Our service worker won't work if PUBLIC_URL is on a different origin
      // from what our page is served on. This might happen if a CDN is used to
      // serve assets; see https://github.com/facebook/create-react-app/issues/2374
      return
    }

    window.addEventListener('load', () => void onWindowLoad(config))
  }
}

export const unregister = async () => {
  console.log('Unregister service worker')
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready
    try {
      await registration.unregister()
    } catch (ex) {
      console.log('Unregister service worker excepted', ex)
    }
  }
}
```

**This file should be copied verbatim.** Do not modify it, refactor it, or "improve" it — it is a shared template across XY projects.
