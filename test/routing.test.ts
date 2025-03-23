import type { Adapter } from '@auth/core/adapters'
import Credentials from '@auth/core/providers/credentials'
import { AutoRouter } from 'itty-router'
import { describe, expect, it, vi } from 'vitest'
import { IAuth, prepareAuthRequest } from '../src'

// const configHandler: IAuth.Handler = (request: IAuth.Request) => ({
//   providers: [],
// })

const authConfig = IAuth.createConfig({
  providers: [],
})

describe('Config', () => {
  it('Should return 500 if AUTH_SECRET is missing', async () => {
    // Simulate missing AUTH_SECRET
    const router = AutoRouter<IAuth.Request, [IAuth.Env]>()

    router.all('*', IAuth.setup(authConfig)).all('/api/auth/*', IAuth.handler())

    const req = new Request('http://localhost/api/auth/signin')
    const res = await router.fetch(req)

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Missing AUTH_SECRET')
  })

  it('Should return 200 auth initial config is correct', async () => {
    const env = { AUTH_SECRET: 'secret' } as IAuth.Env
    const router = AutoRouter<IAuth.Request, [IAuth.Env]>()

    // Update configHandler to accept env
    const configHandler: IAuth.Handler = (request) => ({
      providers: [],
      secret: env.AUTH_SECRET,
      basePath: '/api/auth',
    })

    router.all('*', IAuth.setup(configHandler)).all('/api/auth/*', IAuth.handler())

    const req = new Request('http://localhost/api/auth/signin')
    const res = await router.fetch(req, env)
    expect(res.status).toBe(200)
  })

  it('Should return 401 is if auth cookie is invalid or missing', async () => {
    const env = { AUTH_SECRET: 'secret' } as IAuth.Env
    const router = AutoRouter<IAuth.Request, [IAuth.Env]>()

    router.all('*', IAuth.setup(authConfig)).all('*', IAuth.require()).all('/api/auth/*', IAuth.handler())

    router.get('/api/protected', (c) => 'protected')
    const req = new Request('http://localhost/api/protected')
    const res = await router.fetch(req, env)
    expect(res.status).toBe(401)
  })
})

describe('prepareAuthRequest()', async () => {
  const req = new Request('http://request-base/request-path') as IAuth.Request
  const newReq = await prepareAuthRequest(req, 'https://auth-url-base/auth-url-path')
  it('Should rewrite the base path', () => {
    expect(newReq.url.toString()).toBe('https://auth-url-base/request-path')
  })
})

describe('Credentials Provider', () => {
  const mockAdapter: Adapter = {
    createVerificationToken: vi.fn(),
    useVerificationToken: vi.fn(),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    getUser: vi.fn(),
    getUserByAccount: vi.fn(),
    updateUser: vi.fn(),
    linkAccount: vi.fn(),
    createSession: vi.fn(),
    getSessionAndUser: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
  }

  globalThis.process.env = {
    AUTH_SECRET: 'secret',
  }

  const user = { email: 'itty@itty.com', name: 'Itty' }
  const env = { AUTH_SECRET: 'secret' } as IAuth.Env

  const router = AutoRouter<IAuth.Request, [IAuth.Env]>()

  router
    .all('*', IAuth.setup(getAuthConfig))
    .all('/api/auth/:method?/:provider?', IAuth.handler())
    .all('/api/*', IAuth.require())

  router.get('/api/protected', (request) => {
    const auth = request.authUser
    return auth
  })

  const credentials = Credentials({
    credentials: {
      password: {},
    },
    authorize: (credentials) => {
      if (credentials.password === 'password') {
        return user
      }
      return null
    },
  })

  function getAuthConfig(): IAuth.Config {
    return {
      secret: 'secret',
      providers: [credentials],
      adapter: mockAdapter,
      basePath: '/api/auth',
      callbacks: {
        jwt: ({ token, user }) => {
          if (user) {
            token.id = user.id
          }
          return token
        },
      },
      session: {
        strategy: 'jwt',
      },
    }
  }

  let cookie = ['']

  it('Should not authorize and return 302 - /api/auth/callback/credentials', async () => {
    const csrfReq = new Request('http://localhost/api/auth/csrf', {
      method: 'GET',
    })
    const csrfResponse = await router.fetch(csrfReq, env)

    const csrfData = await csrfResponse.json()
    const csrfToken = csrfData.csrfToken
    const csrfCookieHeader = csrfResponse.headers.get('Set-Cookie')
    if (!csrfCookieHeader) {
      throw new Error('Missing CSRF cookie in the response')
    }

    const body = new URLSearchParams({
      csrfToken, // Include the CSRF token in the body
      password: 'wrongpassword', // Use an incorrect password to trigger the expected error
    })

    const req = new Request('http://localhost/api/auth/callback/credentials', {
      method: 'POST',
      body,
      headers: { Cookie: csrfCookieHeader },
    })

    const res = await router.fetch(req, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'http://localhost/api/auth/signin?error=CredentialsSignin&code=credentials',
    )
  })

  it('Should authorize and return 302 - /api/auth/callback/credentials', async () => {
    const csrfReq = new Request('http://localhost/api/auth/csrf', {
      method: 'GET',
    })
    const csrfResponse = await router.fetch(csrfReq, env)

    // Parse CSRF data
    const csrfData = await csrfResponse.json()
    const csrfToken = csrfData.csrfToken
    const csrfCookieHeader = csrfResponse.headers.get('Set-Cookie')
    if (!csrfCookieHeader) {
      throw new Error('Missing CSRF cookie in the response')
    }

    const body = new URLSearchParams({
      csrfToken, // Include the CSRF token
      password: 'password', // Correct password for successful authentication
    })

    const req = new Request('http://localhost/api/auth/callback/credentials', {
      method: 'POST',
      body,
      headers: { Cookie: csrfCookieHeader },
    })

    // Extract the CSRF cookie value

    const res = await router.fetch(req, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost')
    cookie = res.headers.getSetCookie()
  })

  it('Should authorize and return 200 - /api/protected', async () => {
    const headers = new Headers()
    headers.append('Cookie', cookie[1])

    const req = new Request('http://localhost/api/protected', {
      method: 'GET',
      headers,
    })

    let res: Response

    try {
      res = await router.fetch(req, env)
      expect(res.status).toBe(200)
      const obj = await res.json()
      expect(obj['token']['name']).toBe(user.name)
      expect(obj['token']['email']).toBe(user.email)
    } catch (e) {
      console.log(e)
    }
  })

  it('Should respect x-forwarded-proto and x-forwarded-host', async () => {
    const headers = new Headers()
    headers.append('x-forwarded-proto', 'https')
    headers.append('x-forwarded-host', 'example.com')
    const res = await router.fetch(
      {
        url: 'http://localhost/api/auth/signin',
        method: 'GET',
        headers,
      },
      env,
    )
    let html = await res.text()
    expect(html).toContain('action="https://example.com/api/auth/callback/credentials"')
  })
})
