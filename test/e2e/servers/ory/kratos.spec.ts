import { getKratosPasswords } from "@config"
import {
  LikelyNoUserWithThisPhoneExistError,
  LikelyUserAlreadyExistError,
} from "@domain/authentication/errors"
import { CreateIdentityBody } from "@ory/client"
import {
  AuthWithPhonePasswordlessService,
  extendSession,
  getNextPage,
  IdentityRepository,
  listSessions,
  validateKratosToken,
} from "@services/kratos"
import { AuthenticationKratosError } from "@services/kratos/errors"
import { kratosAdmin, kratosPublic } from "@services/kratos/private"
import {
  activateUser,
  addTotp,
  deactivateUser,
  elevatingSessionWithTotp,
  listIdentitySchemas,
  revokeSessions,
} from "@services/kratos/tests-but-not-prod"
import { baseLogger } from "@services/logger"
import { authenticator } from "otplib"

import { AuthWithEmailPasswordlessService } from "@services/kratos/auth-email-no-password"

import { PhoneCodeInvalidError } from "@domain/phone-provider"

import {
  killServer,
  randomEmail,
  randomPassword,
  randomPhone,
  startServer,
} from "test/helpers"
import { getEmailCode } from "test/helpers/kratos"

const identityRepo = IdentityRepository()

let serverPid: PID

beforeAll(async () => {
  // await removeIdentities()

  // needed for the kratos callback to registration
  serverPid = await startServer("start-main-ci")
})

afterAll(async () => {
  await killServer(serverPid)
})

describe("phoneNoPassword", () => {
  const authService = AuthWithPhonePasswordlessService()

  describe("public selflogin api", () => {
    const phone = randomPhone()
    let kratosUserId: UserId

    it("create a user", async () => {
      const res = await authService.createIdentityWithSession(phone)
      if (res instanceof Error) throw res

      expect(res).toHaveProperty("kratosUserId")
      kratosUserId = res.kratosUserId
    })

    it("can't create user twice", async () => {
      const res = await authService.createIdentityWithSession(phone)

      expect(res).toBeInstanceOf(LikelyUserAlreadyExistError)
    })

    it("login user succeed if user exists", async () => {
      const res = await authService.login(phone)
      if (res instanceof Error) throw res

      expect(res.kratosUserId).toBe(kratosUserId)
    })

    it("new sessions are added when LoginWithPhoneNoPasswordSchema is used", async () => {
      const res = await authService.login(phone)
      if (res instanceof Error) throw res

      expect(res.kratosUserId).toBe(kratosUserId)
      const sessions = await listSessions(kratosUserId)
      if (sessions instanceof Error) throw sessions

      expect(sessions).toHaveLength(3)
    })

    it("add totp", async () => {
      const phone = randomPhone()

      let totpSecret: string
      {
        const res0 = await authService.createIdentityWithSession(phone)
        if (res0 instanceof Error) throw res0

        const session = res0.sessionToken

        const res1 = await addTotp(session)
        if (res1 instanceof Error) throw res1

        totpSecret = res1

        const res2 = await validateKratosToken(session)
        res2
        // TODO
        // expect(res2.aal).toBe("aal2")
      }

      {
        // FIXME: tmp for test.
        // NB: I don't think it make sense to have 2fa for passwordless schema
        // but the test is still useful to know how to use kratos for 2fa
        const password = getKratosPasswords().masterUserPassword

        const res = await authService.login(phone)
        if (res instanceof Error) throw res

        const session = res.sessionToken

        await elevatingSessionWithTotp({
          session,
          code: authenticator.generate(totpSecret),
          password,
        })
      }
    })

    it("login fails is user doesn't exist", async () => {
      const phone = randomPhone()
      const res = await authService.login(phone)
      expect(res).toBeInstanceOf(LikelyNoUserWithThisPhoneExistError)
    })

    it("can get the user with slowFindByPhone", async () => {
      const identity = await identityRepo.slowFindByPhone(phone)
      if (identity instanceof Error) throw identity

      expect(identity.phone).toBe(phone)
    })

    it("forbidding change of a phone number from publicApi", async () => {
      const phone = randomPhone()

      const res = await authService.createIdentityWithSession(phone)
      if (res instanceof Error) throw res

      const res1 = await validateKratosToken(res.sessionToken)
      if (res1 instanceof Error) throw res1
      expect(res1.session.identity.phone).toStrictEqual(phone)

      const res2 = await kratosPublic.createNativeSettingsFlow({
        xSessionToken: res.sessionToken,
      })

      const newPhone = randomPhone()

      try {
        await kratosPublic.updateSettingsFlow({
          flow: res2.data.id,
          updateSettingsFlowBody: {
            method: "profile",
            traits: {
              phone: newPhone,
            },
          },
          xSessionToken: res.sessionToken,
        })

        // should throw
        expect(true).toBeFalsy()
      } catch (err) {
        expect(true).toBeTruthy()
        baseLogger.debug({ err }, "err impossible to update profile")
      }

      // should pass if kratos.yaml/serve.selfservice.after.profile is been deleted

      // const res3 = await validateKratosToken(res.sessionToken)
      // if (res3 instanceof Error) throw res3
      // expect(res3.session.identity.traits).toStrictEqual({ phone: newPhone })
    })
  })

  describe("admin api", () => {
    it("create a user with admin api, and can login with self api", async () => {
      const phone = randomPhone()
      const kratosUserId = await authService.createIdentityNoSession(phone)
      if (kratosUserId instanceof Error) throw kratosUserId

      const res2 = await authService.login(phone)
      if (res2 instanceof Error) throw res2

      expect(res2.kratosUserId).toBe(kratosUserId)
    })
  })
})

it("list users", async () => {
  const res = await identityRepo.listIdentities()
  if (res instanceof Error) throw res
})

describe("token validation", () => {
  const authService = AuthWithPhonePasswordlessService()

  it("validate bearer token", async () => {
    const phone = randomPhone()
    const res = await authService.createIdentityWithSession(phone)
    if (res instanceof Error) throw res

    const token = res.sessionToken
    const res2 = await validateKratosToken(token)
    if (res2 instanceof Error) throw res2
    expect(res2.kratosUserId).toBe(res.kratosUserId)
  })

  it("return error on invalid token", async () => {
    const res = await validateKratosToken("invalid_token" as SessionToken)
    expect(res).toBeInstanceOf(AuthenticationKratosError)
  })
})

describe("session revokation", () => {
  const authService = AuthWithPhonePasswordlessService()

  const phone = randomPhone()
  it("revoke user session", async () => {
    const res = await authService.createIdentityWithSession(phone)
    if (res instanceof Error) throw res
    const kratosUserId = res.kratosUserId

    {
      const { data } = await kratosAdmin.listIdentitySessions({ id: kratosUserId })
      expect(data.length).toBeGreaterThan(0)
    }

    await revokeSessions(kratosUserId)

    {
      const { data } = await kratosAdmin.listIdentitySessions({ id: kratosUserId })
      expect(data.length).toEqual(0)
    }
  })

  it("return error on revoked session", async () => {
    let token: SessionToken
    {
      const res = await authService.login(phone)
      if (res instanceof Error) throw res
      token = res.sessionToken
      await revokeSessions(res.kratosUserId)
    }
    {
      const res = await validateKratosToken(token)
      expect(res).toBeInstanceOf(AuthenticationKratosError)
    }
  })
})

describe.skip("update status", () => {
  // Status on kratos is not implemented
  const authService = AuthWithPhonePasswordlessService()

  let kratosUserId: UserId
  const phone = randomPhone()

  it("deactivate user", async () => {
    {
      const res = await authService.createIdentityWithSession(phone)
      if (res instanceof Error) throw res
      kratosUserId = res.kratosUserId
    }
    await deactivateUser(kratosUserId)
    await authService.login(phone)

    const res = await authService.login(phone)
    expect(res).toBeInstanceOf(AuthenticationKratosError)
  })

  it("activate user", async () => {
    await activateUser(kratosUserId)
    const res = await authService.login(phone)
    if (res instanceof Error) throw res
    expect(res.kratosUserId).toBe(kratosUserId)
  })
})

// FIXME: not sure why this one is failing on github actions
it.skip("list schemas", async () => {
  const res = await listIdentitySchemas()
  if (res instanceof Error) throw res

  const schemasIds = res.map((item) => item.id)

  // what is listed in kratos.yaml#identity.schemas
  expect(schemasIds).toStrictEqual(["phone_no_password_v0", "phone_email_no_password_v0"])
})

it("extend session", async () => {
  const authService = AuthWithPhonePasswordlessService()

  const phone = randomPhone()
  const res = await authService.createIdentityWithSession(phone)
  if (res instanceof Error) throw res

  expect(res).toHaveProperty("kratosUserId")
  const res2 = await kratosPublic.toSession({ xSessionToken: res.sessionToken })
  const session = res2.data
  if (!session.expires_at) throw Error("should have expired_at")
  const initialExpiresAt = new Date(session.expires_at)

  await extendSession({ session })

  const res3 = await kratosPublic.toSession({ xSessionToken: res.sessionToken })
  const newSession = res3.data
  if (!newSession.expires_at) throw Error("should have expired_at")
  const newExpiresAt = new Date(newSession.expires_at)

  expect(initialExpiresAt.getTime()).toBeLessThan(newExpiresAt.getTime())
})

describe("upgrade", () => {
  const password = randomPassword()

  it("move from email to email + phone", async () => {
    const phone = randomPhone()
    const email = randomEmail()
    const adminIdentity: CreateIdentityBody = {
      credentials: { password: { config: { password } } },
      state: "active",
      schema_id: "phone_email_no_password_v0",
      traits: {
        email,
      },
    }

    const { data: identity } = await kratosAdmin.createIdentity({
      createIdentityBody: adminIdentity,
    })

    const { data: identity2 } = await kratosAdmin.updateIdentity({
      id: identity.id,
      updateIdentityBody: {
        schema_id: "phone_email_no_password_v0",
        state: "active",
        traits: {
          phone,
          email,
        },
      },
    })

    expect(identity.id).toBe(identity2.id)
    expect(identity2.traits).toStrictEqual({
      phone,
      email,
    })
  })
})

describe("phone+email schema", () => {
  const authServiceEmail = AuthWithEmailPasswordlessService()
  const authServicePhone = AuthWithPhonePasswordlessService()

  let kratosUserId: UserId
  const email = randomEmail()
  const phone = randomPhone()

  it("create a user", async () => {
    const res0 = await authServicePhone.createIdentityWithSession(phone)
    if (res0 instanceof Error) throw res0
    kratosUserId = res0.kratosUserId

    const res = await authServicePhone.upgradeToPhoneAndEmailSchema({
      kratosUserId,
      email,
    })
    if (res instanceof Error) throw res

    const newIdentity = await kratosAdmin.getIdentity({ id: kratosUserId })
    expect(newIdentity.data.schema_id).toBe("phone_email_no_password_v0")
    expect(newIdentity.data.traits.email).toBe(email)
    expect(newIdentity.data.verifiable_addresses?.[0].verified).toBe(false)
  })

  it("verification for phone + email schema", async () => {
    const flow = await authServiceEmail.initiateEmailVerification(email)
    if (flow instanceof Error) throw flow

    {
      const identity = await kratosAdmin.getIdentity({ id: kratosUserId })
      expect(identity.data.verifiable_addresses?.[0].verified).toBe(false)
    }

    {
      const wrongCode = "000000"
      const res = await authServiceEmail.validateEmailVerification({
        code: wrongCode,
        flow,
      })
      expect(res).toBeInstanceOf(PhoneCodeInvalidError)
    }

    {
      const code = await getEmailCode({ email })

      // TODO: verification code expired
      const res = await authServiceEmail.validateEmailVerification({ code, flow })
      expect(res).toBe(true)

      const identity = await kratosAdmin.getIdentity({ id: kratosUserId })
      expect(identity.data.verifiable_addresses?.[0].verified).toBe(true)
    }
  })

  it("login back to an phone+email account by email", async () => {
    const flow = await authServiceEmail.initiateEmailVerification(email)
    if (flow instanceof Error) throw flow

    const code = await getEmailCode({ email })

    {
      const wrongCode = "000000"
      const res = await authServiceEmail.validateEmailVerification({
        code: wrongCode,
        flow,
      })
      expect(res).toBeInstanceOf(PhoneCodeInvalidError)
    }

    {
      const res = await authServiceEmail.validateEmailVerification({ code, flow })
      expect(res).toBe(true)
    }

    {
      const res = await authServiceEmail.login(email)
      if (res instanceof Error) throw res
      expect(res.kratosUserId).toBe(kratosUserId)
    }

    // TODO: verification code expired
  })

  it("login back to an phone+email account by phone", async () => {
    const res = await authServicePhone.login(phone)
    if (res instanceof Error) throw res

    expect(res.kratosUserId).toBe(kratosUserId)
    const identity = await kratosAdmin.getIdentity({ id: kratosUserId })
    expect(identity.data.schema_id).toBe("phone_email_no_password_v0")
  })
})

describe("decoding link header", () => {
  const withNext =
    '<http://0.0.0.0:4434/identities?page=1&per_page=1>; rel="next",<http://0.0.0.0:4434/identities?page=37&per_page=1>; rel="last"'

  const withoutNext =
    '<http://0.0.0.0:4434/identities?page=0&per_page=1>; rel="first",<http://0.0.0.0:4434/identities?page=46&per_page=1>; rel="prev"'

  it("try decoding link successfully", () => {
    expect(getNextPage(withNext)).toBe(1)
  })

  it("should be undefined when no more next is present", () => {
    expect(getNextPage(withoutNext)).toBe(undefined)
  })
})
