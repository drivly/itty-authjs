# Auth.js middleware for Itty-Router

Drivly's Auth.js library for Itty Router

## Installation

```bash
npm install @drivly/itty-authjs
```

This package has a peer dependency on `itty-router`, so you'll need to install it as well:

```bash
npm install itty-router
```

## Configuration

Before using the middleware, you need to configure the environment variables for the authentication.

```bash
AUTH_SECRET=#required - a random string used to encrypt cookies and tokens
AUTH_URL=#optional - custom URL for auth endpoints
```

## Usage

### Basic Setup

```typescript
import { IAuth, type AuthRequest, type AuthEnv } from '@drivly/itty-authjs'
import GitHub from '@auth/core/providers/github'
import { AutoRouter } from 'itty-router'

const router = AutoRouter<AuthRequest, [AuthEnv]>()

// Add auth configuration middleware to all routes
router.all('*', IAuth.setup(getAuthConfig))

// Handle Auth.js routes
router.all('/api/auth/*', IAuth.handler())

// Add authentication middleware to protected routes
router.all('/api/*', IAuth.require())

// Access auth user data in protected routes
router.get('/api/protected', (request) => {
  const auth = request.authUser
  return auth
})

// Auth configuration function
function getAuthConfig(request: AuthRequest, env: AuthEnv) {
  return {
    secret: env.AUTH_SECRET,
    providers: [
      GitHub({
        clientId: env.GITHUB_ID,
        clientSecret: env.GITHUB_SECRET,
      }),
    ],
  }
}

export default router
```

### Simplified Setup Using createConfig

```typescript
import { IAuth, type AuthRequest, type AuthEnv } from '@drivly/itty-authjs'
import GitHub from '@auth/core/providers/github'
import { AutoRouter } from 'itty-router'

const router = AutoRouter<AuthRequest, [AuthEnv]>()

// Create a config with GitHub provider
const authConfig = IAuth.createConfig({
  providers: [
    GitHub({
      clientId: 'GITHUB_ID',
      clientSecret: 'GITHUB_SECRET',
    }),
  ],
  // Optional: customize base path (defaults to /api/auth)
  basePath: '/auth',
  // Optional: additional Auth.js options
  additionalOptions: {
    pages: {
      signIn: '/login',
    },
  },
})

// Use the created config
router.all('*', IAuth.setup(authConfig))
router.all('/auth/*', IAuth.handler())
router.all('/api/*', IAuth.require())

export default router
```

### Using Direct Function Imports

If you prefer direct function imports instead of the namespace approach:

```typescript
import {
  setupAuth,
  requireAuth,
  handleAuthRoutes,
  createConfig,
  type AuthRequest,
  type AuthEnv,
} from '@drivly/itty-authjs'
import GitHub from '@auth/core/providers/github'
import { AutoRouter } from 'itty-router'

const router = AutoRouter<AuthRequest, [AuthEnv]>()

// Create a config with GitHub provider
const authConfig = createConfig({
  providers: [
    GitHub({
      clientId: 'GITHUB_ID',
      clientSecret: 'GITHUB_SECRET',
    }),
  ],
})

router.all('*', setupAuth(authConfig))
router.all('/api/auth/*', handleAuthRoutes())
router.all('/api/*', requireAuth())

export default router
```

## API Reference

### IAuth Namespace

The `IAuth` namespace provides a cleaner way to import and use the library:

- `IAuth.setup(configFn)`: Sets up Auth.js configuration for the environment.
- `IAuth.handler()`: Handles Auth.js routes.
- `IAuth.require()`: Middleware that requires authentication.
- `IAuth.createConfig(options)`: Utility to easily create a config handler function with sensible defaults.

### Methods

- `setupAuth(configFn)`: Sets up Auth.js configuration for the environment.
- `handleAuthRoutes()`: Handles Auth.js routes.
- `requireAuth()`: Middleware that requires authentication.
- `createConfig(options)`: Utility to easily create a config handler function with sensible defaults.

### createConfig Options

The `createConfig` function accepts the following options:

```typescript
interface CreateConfigOptions {
  providers: Array<Provider> // Auth.js providers
  basePath?: string // Optional custom base path (defaults to /api/auth)
  additionalOptions?: Partial<Omit<AuthConfig, 'providers' | 'basePath'>> // Any other Auth.js options
}
```

Example usage:

```typescript
const authConfig = createConfig({
  providers: [
    GitHub({
      clientId: 'GITHUB_ID',
      clientSecret: 'GITHUB_SECRET',
    }),
  ],
  basePath: '/auth',

  additionalOptions: {
    pages: {
      signIn: '/custom-login',
    },
    trustHost: true,
  },
})
```

### Types

- `AuthRequest`: Extended Itty-Router request with auth properties
- `AuthEnv`: Environment type with Auth.js requirements
- `AuthUser`: User data from authentication
- `AuthConfig`: Auth.js configuration type
- `ConfigHandler`: Function type for auth configuration callbacks

### IAuth Namespace Types

The `IAuth` namespace also includes these types:

- `IAuth.Request`: Same as `AuthRequest`
- `IAuth.Env`: Same as `AuthEnv`
- `IAuth.User`: Same as `AuthUser`
- `IAuth.Config`: Same as `AuthConfig`
- `IAuth.Handler`: Same as `ConfigHandler`

## Advanced Configuration

For more advanced Auth.js configuration options, refer to the [Auth.js documentation](https://authjs.dev/reference/configuration/auth-config).

```typescript
function getAuthConfig(request: AuthRequest, env: AuthEnv) {
  return {
    secret: env.AUTH_SECRET,
    providers: [...],
    callbacks: {
      async session({ session, token, user }) {
        // Custom session handling
        return session
      },
      async jwt({ token, user, account, profile }) {
        // Custom JWT handling
        return token
      }
    },
    // Other Auth.js options
    pages: {
      signIn: '/custom-signin'
    }
  }
}
```
