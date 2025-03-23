import type { AuthConfig as AuthConfigCore } from '@auth/core'
import { Auth as AuthCore, setEnvDefaults as coreSetEnvDefaults } from '@auth/core'
import type { AdapterUser } from '@auth/core/adapters'
import type { JWT } from '@auth/core/jwt'
import type { Session } from '@auth/core/types'
import { IRequest as IttyRequest, RequestHandler } from 'itty-router'

//============== Type Definitions ==============

export interface AuthRequest extends IttyRequest {
  authUser?: AuthUser
  authConfig: AuthConfig
}

export type CFArgs = [AuthEnv]

export interface AuthEnv {
  AUTH_URL?: string
  AUTH_SECRET: string
  AUTH_REDIRECT_PROXY_URL?: string
  [key: string]: string | undefined
}

export interface AuthUser {
  session: Session
  token?: JWT
  user?: AdapterUser
}

export interface AuthConfig extends Omit<AuthConfigCore, 'raw'> {}

export type ConfigHandler = (request: AuthRequest) => AuthConfig

//============== Utility Functions ==============
export function setEnvDefaults(env: AuthEnv, config: AuthConfig) {
  config.secret ??= env.AUTH_SECRET
  config.basePath ||= '/api/auth'
  coreSetEnvDefaults(env, config)
}

async function cloneRequest(input: URL | string, request: IttyRequest) {
  return new Request(input, request)
}

export async function prepareAuthRequest(req: IttyRequest, authUrl?: string) {
  if (authUrl) {
    const reqUrlObj = new URL(req.url)
    const authUrlObj = new URL(authUrl)
    const props = ['hostname', 'protocol', 'port', 'password', 'username'] as const
    props.forEach((prop) => (reqUrlObj[prop] = authUrlObj[prop]))
    return cloneRequest(reqUrlObj.href, req)
  } else {
    const url = new URL(req.url)
    const headers = new Headers(req.headers)
    const proto = headers.get('x-forwarded-proto')
    const host = headers.get('x-forwarded-host') ?? headers.get('host')
    if (proto != null) url.protocol = proto.endsWith(':') ? proto : proto + ':'
    if (host != null) {
      url.host = host
      const portMatch = host.match(/:(\d+)$/)
      if (portMatch) url.port = portMatch[1] ?? ''
      else url.port = ''
      headers.delete('x-forwarded-host')
      headers.delete('Host')
      headers.set('Host', host)
    }
    return cloneRequest(url.href, req)
  }
}

// ========== Core Authentication Functions ==========

export async function getUserFromSession(request: AuthRequest, env: AuthEnv): Promise<AuthUser | null> {
  const config = request.authConfig
  setEnvDefaults(env, config)

  const authReq = await prepareAuthRequest(request, env.AUTH_URL)
  const origin = new URL(authReq.url).origin
  const sessionUrl = `${origin}${config.basePath}/session`

  const reqHeaders = new Headers(authReq.headers)
  reqHeaders.set('Cookie', request.headers.get('Cookie') ?? '')

  const sessionRequest = new Request(sessionUrl, {
    headers: reqHeaders,
    method: 'GET',
  })

  let authUser: AuthUser = {} as AuthUser

  const response = (await AuthCore(sessionRequest, {
    ...config,
    callbacks: {
      ...config.callbacks,
      async session(...args) {
        authUser = args[0]
        const session = (await config.callbacks?.session?.(...args)) ?? args[0].session
        const user = args[0].user ?? args[0].token
        return { user, ...session } as Session
      },
    },
  })) as Response

  const session = (await response.json()) as Session | null

  return session && session.user ? authUser : null
}

// ========== Middleware Functions ==========

export function requireAuth(): RequestHandler<AuthRequest, CFArgs> {
  return async (request, env) => {
    const authUser = await getUserFromSession(request, env)
    const isAuth = !!authUser?.token || !!authUser?.user

    if (!isAuth) {
      return new Response('Unauthorized', { status: 401 })
    } else {
      request.authUser = authUser
    }
  }
}

export function setupAuth(callback: ConfigHandler): (...args: Parameters<typeof callback>) => Promise<void> {
  return async (request) => {
    const config = callback(request)
    request.authConfig = config
  }
}

export function handleAuthRoutes(): RequestHandler<AuthRequest, CFArgs> {
  return async (request, env) => {
    const config = request.authConfig

    if (!config.secret || config.secret.length === 0) {
      return new Response('Missing AUTH_SECRET', { status: 500 })
    }

    setEnvDefaults(env, config)
    const authReq = await prepareAuthRequest(request, env.AUTH_URL)
    const response = await AuthCore(authReq, config)
    return new Response(response.body, response)
  }
}

/**
 * Creates a standard auth configuration with sensible defaults
 * @param options Basic configuration options
 * @returns A ConfigHandler function that can be passed to Auth.setup
 */
export function createConfig(options: {
  /** Auth providers to use for authentication */
  providers: AuthConfig['providers']
  /** Custom base path for auth routes (default: /api/auth) */
  basePath?: string
  /** Any additional Auth.js configuration options */
  additionalOptions?: Partial<Omit<AuthConfig, 'providers' | 'basePath'>>
}): ConfigHandler {
  const { providers, basePath, additionalOptions = {} } = options

  return (_request: AuthRequest): AuthConfig => {
    // This matches the ConfigHandler type signature perfectly
    return {
      providers,
      basePath: basePath ?? '/api/auth',
      ...additionalOptions,
      // Auth.SECRET is handled by setEnvDefaults in the middleware
    }
  }
}

// ========== Namespace Object (Optional) ==========

export const IAuth = {
  setup: setupAuth,
  require: requireAuth,
  handler: handleAuthRoutes,
  getUser: getUserFromSession,
  createConfig,
}

// Add types to namespace as well
export namespace IAuth {
  export type Config = AuthConfig
  export type Request = AuthRequest
  export type Env = AuthEnv
  export type User = AuthUser
  export type Handler = ConfigHandler
}
