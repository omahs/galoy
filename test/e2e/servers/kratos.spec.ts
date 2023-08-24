import {
  AuthWithPhonePasswordlessService,
  IdentityRepository,
  getNextPage,
  validateKratosToken,
  AuthenticationKratosError,
  kratosValidateTotp,
  kratosInitiateTotp,
  kratosElevatingSessionWithTotp,
  kratosRemoveTotp,
} from "@services/kratos"
import { kratosAdmin, kratosPublic } from "@services/kratos/private"
import { activateUser, deactivateUser } from "@services/kratos/tests-but-not-prod"
import { authenticator } from "otplib"

import { sleep } from "@utils"

import { getError, randomPhone } from "test/helpers"

beforeAll(async () => {
  // await removeIdentities()
  // needed for the kratos callback to registration
  // serverPid = await startServer("start-main-ci")
})

afterAll(async () => {
  // await killServer(serverPid)
})

describe("phoneNoPassword", () => {
  const authService = AuthWithPhonePasswordlessService()

  describe("public selflogin api", () => {
    it("add totp", async () => {
      const phone = randomPhone()
      let authToken: AuthToken
      let userId: UserId

      let totpSecret: string
      {
        const res0 = await authService.createIdentityWithSession({ phone })
        if (res0 instanceof Error) throw res0

        authToken = res0.authToken

        const res1 = await kratosInitiateTotp(authToken)
        if (res1 instanceof Error) throw res1

        const { totpSecret: totpSecret_, totpRegistrationId } = res1
        totpSecret = totpSecret_
        const totpCode = authenticator.generate(totpSecret)

        const res = kratosValidateTotp({ totpRegistrationId, totpCode, authToken })
        if (res instanceof Error) throw res

        const res2 = await validateKratosToken(authToken)
        if (res2 instanceof Error) throw res2
        expect(res2).toEqual(
          expect.objectContaining({
            kratosUserId: expect.any(String),
            session: expect.any(Object),
          }),
        )

        // wait for the identity to be updated?
        // some cache or asynchronous method need to run on the kratos side?
        await sleep(100)
        const identity = await IdentityRepository().getIdentity(res2.kratosUserId)
        if (identity instanceof Error) throw identity
        expect(identity.totpEnabled).toBe(true)

        userId = res2.kratosUserId
      }

      {
        const res = await authService.loginToken({ phone })
        if (res instanceof Error) throw res
        expect(res).toEqual(
          expect.objectContaining({
            kratosUserId: undefined,
            authToken: expect.any(String),
          }),
        )

        const totpCode = authenticator.generate(totpSecret) as TotpCode

        const res2 = await kratosElevatingSessionWithTotp({
          authToken: res.authToken,
          totpCode,
        })
        if (res2 instanceof Error) throw res2
        expect(res2).toBe(true)
      }

      await kratosRemoveTotp(authToken)

      // wait for the identity to be updated?
      // some cache or asynchronous method need to run on the kratos side?
      await sleep(100)
      const identity = await IdentityRepository().getIdentity(userId)
      if (identity instanceof Error) throw identity
      expect(identity.totpEnabled).toBe(false)
    })

    it("forbidding change of a phone number from publicApi", async () => {
      const phone = randomPhone()

      const res = await authService.createIdentityWithSession({ phone })
      if (res instanceof Error) throw res

      const res1 = await validateKratosToken(res.authToken)
      if (res1 instanceof Error) throw res1
      expect(res1.session.identity.phone).toStrictEqual(phone)

      const res2 = await kratosPublic.createNativeSettingsFlow({
        xSessionToken: res.authToken,
      })

      const newPhone = randomPhone()

      const err = await getError(() =>
        kratosPublic.updateSettingsFlow({
          flow: res2.data.id,
          updateSettingsFlowBody: {
            method: "profile",
            traits: {
              phone: newPhone,
            },
          },
          xSessionToken: res.authToken,
        }),
      )

      expect(err).toBeTruthy()
    })
  })
})

describe("token validation", () => {
  const authService = AuthWithPhonePasswordlessService()

  it("validate bearer token", async () => {
    const phone = randomPhone()
    const res = await authService.createIdentityWithSession({ phone })
    if (res instanceof Error) throw res

    const token = res.authToken
    const res2 = await validateKratosToken(token)
    if (res2 instanceof Error) throw res2
    expect(res2.kratosUserId).toBe(res.kratosUserId)
  })

  it("return error on invalid token", async () => {
    const res = await validateKratosToken("invalid_token" as AuthToken)
    expect(res).toBeInstanceOf(AuthenticationKratosError)
  })
})

describe.skip("update status", () => {
  // Status on kratos is not implemented
  const authService = AuthWithPhonePasswordlessService()

  let kratosUserId: UserId
  const phone = randomPhone()

  it("deactivate user", async () => {
    {
      const res = await authService.createIdentityWithSession({ phone })
      if (res instanceof Error) throw res
      kratosUserId = res.kratosUserId
    }
    await deactivateUser(kratosUserId)
    await authService.loginToken({ phone })

    const res = await authService.loginToken({ phone })
    expect(res).toBeInstanceOf(AuthenticationKratosError)
  })

  it("activate user", async () => {
    await activateUser(kratosUserId)
    const res = await authService.loginToken({ phone })
    if (res instanceof Error) throw res
    expect(res.kratosUserId).toBe(kratosUserId)
  })
})

describe("decoding link header", () => {
  const withNext =
    '<http://0.0.0.0:4434/identities?page=1&page_size=1&page_token=eyJvZmZzZXQiOiIxIiwidiI6Mn0&per_page=1>; rel="next",<http://0.0.0.0:4434/identities?page=1&page_size=1&page_token=eyJvZmZzZXQiOiIxIiwidiI6Mn0&per_page=1>; rel="last"'

  const withoutNext =
    '<http://0.0.0.0:4434/identities?page=0&page_size=1&page_token=eyJvZmZzZXQiOiIwIiwidiI6Mn0&per_page=1>; rel="first",<http://0.0.0.0:4434/identities?page=0&page_size=1&page_token=eyJvZmZzZXQiOiIwIiwidiI6Mn0&per_page=1>; rel="prev"'

  it("try decoding link successfully", () => {
    expect(getNextPage(withNext)).toBe(1)
  })

  it("should be undefined when no more next is present", () => {
    expect(getNextPage(withoutNext)).toBe(undefined)
  })
})
