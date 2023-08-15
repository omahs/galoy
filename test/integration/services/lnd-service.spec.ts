import { createInvoice, getChannel } from "lightning"

import { WalletCurrency } from "@domain/shared"
import { toSats } from "@domain/bitcoin"
import {
  LnAlreadyPaidError,
  PaymentNotFoundError,
  PaymentRejectedByDestinationError,
  PaymentStatus,
  RouteNotFoundError,
  decodeInvoice,
} from "@domain/bitcoin/lightning"
import { LnFees } from "@domain/payments"

import { LndService } from "@services/lnd"

import { sleep } from "@utils"

import {
  bitcoindClient,
  fundLnd,
  lnd1,
  lndOutside1,
  lndOutside2,
  mineAndConfirm,
  openChannelTestingNoAccounting,
  resetIntegrationLnds,
  setChannelFees,
} from "test/helpers"
import { BitcoindWalletClient } from "test/helpers/bitcoind"

const amountInvoice = toSats(1000)
const btcPaymentAmount = { amount: BigInt(amountInvoice), currency: WalletCurrency.Btc }
const ROUTE_PPM_RATE = 10_000
const ROUTE_PPM_PERCENT = ROUTE_PPM_RATE / 1_000_000

const loadBitcoindWallet = async (walletName) => {
  const wallets = await bitcoindClient.listWallets()
  if (!wallets.includes(walletName)) {
    try {
      await bitcoindClient.createWallet({ walletName })
    } catch (err) {
      const error = err as Error
      if (error.message.includes("Database already exists")) {
        await bitcoindClient.loadWallet({ filename: walletName })
      }
    }
  }
}

const fundOnChainWallets = async () => {
  // Setup outside bitcoind
  const walletName = "outside"
  const bitcoindOutside = new BitcoindWalletClient(walletName)

  // Fund outside bitcoind
  const numOfBlocks = 10
  const bitcoindAddress = await bitcoindOutside.getNewAddress()
  await mineAndConfirm({
    walletClient: bitcoindOutside,
    numOfBlocks,
    address: bitcoindAddress,
  })

  // Fund lnd1
  const btc = 1
  await fundLnd(lnd1, btc)
}

const setupLndRoute = async () => {
  // Setup route from lnd1 -> lndOutside1 -> lndOutside2
  const btc = 1
  await fundLnd(lndOutside1, btc)

  const { lndNewChannel: lndOutside2Channel } = await openChannelTestingNoAccounting({
    lnd: lndOutside1,
    lndPartner: lndOutside2,
    socket: `lnd-outside-2:9735`,
    is_private: true,
  })

  // Set fee policy on lndOutside1 as routing node between lnd1 and lndOutside2
  let count = 0
  let countMax = 9
  let setOnLndOutside1
  while (count < countMax && setOnLndOutside1 !== true) {
    if (count > 0) await sleep(500)
    count++

    setOnLndOutside1 = await setChannelFees({
      lnd: lndOutside1,
      channel: lndOutside2Channel,
      base: 0,
      rate: ROUTE_PPM_RATE,
    })
  }
  if (!(count < countMax && setOnLndOutside1)) {
    throw new Error("Could not update channel fees")
  }

  let policies
  let errMsg: string | undefined = "FullChannelDetailsNotFound"
  count = 0
  countMax = 8
  // Try to getChannel for up to 2 secs (250ms x 8)
  while (count < countMax && errMsg === "FullChannelDetailsNotFound") {
    count++
    await sleep(250)
    try {
      ;({ policies } = await getChannel({ id: lndOutside2Channel.id, lnd: lndOutside1 }))
      errMsg = undefined
    } catch (err) {
      if (Array.isArray(err)) errMsg = err[1]
    }
  }
  if (!(count < countMax && errMsg !== "FullChannelDetailsNotFound")) {
    throw new Error("Could find updated channel details")
  }
  if (!(policies && policies.length)) {
    throw new Error("No channel policies found")
  }

  const { base_fee_mtokens, fee_rate, public_key } = policies[0]
  if (
    !(
      public_key === process.env.LND_OUTSIDE_1_PUBKEY &&
      base_fee_mtokens === "0" &&
      fee_rate === ROUTE_PPM_RATE
    )
  ) {
    throw new Error("Incorrect policy on channel")
  }
}

beforeAll(async () => {
  // Seed lnd1 & lndOutside1
  await loadBitcoindWallet("outside")
  await resetIntegrationLnds()
  await fundOnChainWallets()
  await openChannelTestingNoAccounting({
    lnd: lnd1,
    lndPartner: lndOutside1,
    socket: `lnd-outside-1:9735`,
  })
  await setupLndRoute()
})

afterAll(async () => {
  await bitcoindClient.unloadWallet({ walletName: "outside" })
})

describe("LndService", () => {
  const lndService = LndService()
  if (lndService instanceof Error) throw lndService

  it("fails when repaying invoice", async () => {
    // Create invoice
    const { request } = await createInvoice({
      lnd: lndOutside1,
      tokens: amountInvoice,
    })
    const lnInvoice = decodeInvoice(request)
    if (lnInvoice instanceof Error) throw lnInvoice

    const paid = await lndService.payInvoiceViaPaymentDetails({
      decodedInvoice: lnInvoice,
      btcPaymentAmount,
      maxFeeAmount: undefined,
    })
    if (paid instanceof Error) throw paid
    expect(paid.revealedPreImage).toHaveLength(64)

    const retryPaid = await lndService.payInvoiceViaPaymentDetails({
      decodedInvoice: lnInvoice,
      btcPaymentAmount,
      maxFeeAmount: undefined,
    })
    expect(retryPaid).toBeInstanceOf(LnAlreadyPaidError)
  })

  it("fails to pay when channel capacity exceeded", async () => {
    const { request } = await createInvoice({ lnd: lndOutside1, tokens: 1500000 })
    const lnInvoice = decodeInvoice(request)
    if (lnInvoice instanceof Error) throw lnInvoice

    const paid = await lndService.payInvoiceViaPaymentDetails({
      decodedInvoice: lnInvoice,
      btcPaymentAmount,
      maxFeeAmount: undefined,
    })
    expect(paid).toBeInstanceOf(PaymentRejectedByDestinationError)
  })

  it("pay invoice with High CLTV Delta", async () => {
    // Create invoice
    const { request } = await createInvoice({
      lnd: lndOutside1,
      tokens: amountInvoice,
      cltv_delta: 200,
    })
    const lnInvoice = decodeInvoice(request)
    if (lnInvoice instanceof Error) throw lnInvoice

    const paid = await lndService.payInvoiceViaPaymentDetails({
      decodedInvoice: lnInvoice,
      btcPaymentAmount,
      maxFeeAmount: undefined,
    })
    if (paid instanceof Error) throw paid
    expect(paid.revealedPreImage).toHaveLength(64)
  })

  it("pays high fee route with no max limit", async () => {
    let lnInvoice: LnInvoice | undefined = undefined
    let tries = 0
    let routeHints: Hop[][] = []
    while (routeHints.length === 0 && tries < 20) {
      tries++

      const { request } = await createInvoice({
        lnd: lndOutside2,
        is_including_private_channels: true,
      })
      const invoice = decodeInvoice(request)
      if (invoice instanceof Error) throw invoice

      lnInvoice = invoice
      ;({ routeHints } = lnInvoice)
      await sleep(500)
    }
    if (lnInvoice === undefined) throw new Error("lnInvoice is undefined")

    const paid = await lndService.payInvoiceViaPaymentDetails({
      decodedInvoice: lnInvoice,
      btcPaymentAmount,
      maxFeeAmount: undefined,
    })
    if (paid instanceof Error) throw paid
    expect(paid.revealedPreImage).toHaveLength(64)
    expect(paid.roundedUpFee).toEqual(Number(btcPaymentAmount.amount) * ROUTE_PPM_PERCENT)
  })

  it("fails to pay high fee route with max limit set", async () => {
    let lnInvoice: LnInvoice | undefined = undefined
    let tries = 0
    let routeHints: Hop[][] = []
    while (routeHints.length === 0 && tries < 20) {
      tries++

      const { request } = await createInvoice({
        lnd: lndOutside2,
        is_including_private_channels: true,
      })
      const invoice = decodeInvoice(request)
      if (invoice instanceof Error) throw invoice

      lnInvoice = invoice
      ;({ routeHints } = lnInvoice)
      await sleep(500)
    }
    if (lnInvoice === undefined) throw new Error("lnInvoice is undefined")

    const paid = await lndService.payInvoiceViaPaymentDetails({
      decodedInvoice: lnInvoice,
      btcPaymentAmount,
      maxFeeAmount: LnFees().maxProtocolAndBankFee(btcPaymentAmount),
    })
    expect(paid).toBeInstanceOf(RouteNotFoundError)
  })

  it("deletes payment", async () => {
    const { request, secret } = await createInvoice({ lnd: lndOutside1 })
    const revealedPreImage = secret as RevealedPreImage
    const lnInvoice = decodeInvoice(request)
    if (lnInvoice instanceof Error) throw lnInvoice
    const { paymentHash } = lnInvoice

    const paid = await lndService.payInvoiceViaPaymentDetails({
      decodedInvoice: lnInvoice,
      btcPaymentAmount,
      maxFeeAmount: undefined,
    })
    if (paid instanceof Error) throw paid

    // Confirm payment exists in lnd
    const retrievedPayment = await lndService.lookupPayment({ paymentHash })
    expect(retrievedPayment).not.toBeInstanceOf(Error)
    if (retrievedPayment instanceof Error) return retrievedPayment
    expect(retrievedPayment.status).toBe(PaymentStatus.Settled)
    if (retrievedPayment.status !== PaymentStatus.Settled) return
    expect(retrievedPayment.confirmedDetails?.revealedPreImage).toBe(revealedPreImage)

    // Delete payment
    const deleted = await lndService.deletePaymentByHash({ paymentHash })
    expect(deleted).not.toBeInstanceOf(Error)

    // Check that payment no longer exists
    const retrievedDeletedPayment = await lndService.lookupPayment({ paymentHash })
    expect(retrievedDeletedPayment).toBeInstanceOf(PaymentNotFoundError)

    // Check that deleting missing payment doesn't return error
    const deletedAttempt = await lndService.deletePaymentByHash({ paymentHash })
    expect(deletedAttempt).not.toBeInstanceOf(Error)
  })
})
