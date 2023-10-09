import { getFeesConfig, getOnChainWalletConfig } from "@/config"

import { removeDeviceTokens } from "@/app/users/remove-device-tokens"
import { getCurrentPriceAsDisplayPriceRatio, usdFromBtcMidPriceFn } from "@/app/prices"

import {
  DepositFeeCalculator,
  PaymentInitiationMethod,
  SettlementMethod,
} from "@/domain/wallets"
import { WalletAddressReceiver } from "@/domain/wallet-on-chain/wallet-address-receiver"
import { DuplicateKeyForPersistError, LessThanDustThresholdError } from "@/domain/errors"
import { DeviceTokensNotRegisteredNotificationsServiceError } from "@/domain/notifications"

import {
  AccountsRepository,
  UsersRepository,
  WalletOnChainPendingReceiveRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { LockService } from "@/services/lock"
import { baseLogger } from "@/services/logger"
import { LedgerService } from "@/services/ledger"
import { DealerPriceService } from "@/services/dealer-price"
import { NotificationsService } from "@/services/notifications"
import { DisplayAmountsConverter } from "@/domain/fiat/display-amounts-converter"

const dealer = DealerPriceService()
const { dustThreshold } = getOnChainWalletConfig()
const feesConfig = getFeesConfig()

export const addPendingTransaction = async ({
  txId,
  vout,
  satoshis,
  address,
}: {
  txId: OnChainTxHash
  vout: OnChainTxVout
  satoshis: BtcPaymentAmount
  address: OnChainAddress
}): Promise<true | ApplicationError> => {
  if (satoshis.amount < dustThreshold) {
    return new LessThanDustThresholdError(`${dustThreshold}`)
  }

  const wallet = await WalletsRepository().findByAddress(address)
  if (wallet instanceof Error) return wallet

  const account = await AccountsRepository().findById(wallet.accountId)
  if (account instanceof Error) return account

  const satsFee = DepositFeeCalculator().onChainDepositFee({
    amount: satoshis,
    minBankFee: feesConfig.depositDefaultMin,
    minBankFeeThreshold: feesConfig.depositThreshold,
    ratio: feesConfig.depositRatioAsBasisPoints,
  })
  if (satsFee instanceof Error) return satsFee

  return LockService().lockOnChainTxHashAndVout({ txHash: txId, vout }, async () => {
    // this validation is necessary in case we need to reprocess bria events
    const recordedResult = await LedgerService().isOnChainReceiptTxRecordedForWallet({
      walletId: wallet.id,
      txHash: txId,
      vout,
    })
    if (recordedResult instanceof Error) {
      baseLogger.error({ error: recordedResult }, "Could not query ledger")
      return recordedResult
    }
    if (recordedResult.recorded) {
      await WalletOnChainPendingReceiveRepository().remove({
        walletId: wallet.id,
        transactionHash: txId,
        vout,
      })
      return true
    }

    const walletAddressReceiver = await WalletAddressReceiver({
      walletAddress: {
        address,
        recipientWalletDescriptor: wallet,
      },
      receivedBtc: satoshis,
      satsFee,
      usdFromBtc: dealer.getCentsFromSatsForImmediateBuy,
      usdFromBtcMidPrice: usdFromBtcMidPriceFn,
    })
    if (walletAddressReceiver instanceof Error) return walletAddressReceiver

    const {
      btcToCreditReceiver: btcPaymentAmount,
      btcBankFee: btcProtocolAndBankFee,
      usdToCreditReceiver: usdPaymentAmount,
      usdBankFee: usdProtocolAndBankFee,
    } = walletAddressReceiver
    const { amountToCreditReceiver: settlementAmount, bankFee: settlementFee } =
      walletAddressReceiver.settlementAmounts()

    const displayPriceRatio = await getCurrentPriceAsDisplayPriceRatio({
      currency: account.displayCurrency,
    })
    if (displayPriceRatio instanceof Error) return displayPriceRatio

    const {
      displayAmount: settlementDisplayAmount,
      displayFee: settlementDisplayFee,
      displayPrice: settlementDisplayPrice,
    } = DisplayAmountsConverter(displayPriceRatio).convert({
      btcPaymentAmount,
      btcProtocolAndBankFee,
      usdPaymentAmount,
      usdProtocolAndBankFee,
    })

    const pendingTransaction: WalletOnChainPendingTransaction = {
      walletId: wallet.id,
      settlementAmount,
      settlementFee,
      settlementCurrency: wallet.currency,
      settlementDisplayAmount,
      settlementDisplayFee,
      settlementDisplayPrice,

      createdAt: new Date(),
      initiationVia: {
        type: PaymentInitiationMethod.OnChain,
        address,
      },
      settlementVia: {
        type: SettlementMethod.OnChain,
        transactionHash: txId,
        vout,
      },
    }

    const res =
      await WalletOnChainPendingReceiveRepository().persistNew(pendingTransaction)
    if (res instanceof Error && !(res instanceof DuplicateKeyForPersistError)) {
      return res
    }

    const recipientUser = await UsersRepository().findById(account.kratosUserId)
    if (recipientUser instanceof Error) return recipientUser

    const result = await NotificationsService().onChainTxReceivedPending({
      recipientAccountId: wallet.accountId,
      recipientWalletId: wallet.id,
      paymentAmount: settlementAmount,
      displayPaymentAmount: settlementDisplayAmount,
      txHash: txId,
      recipientDeviceTokens: recipientUser.deviceTokens,
      recipientNotificationSettings: account.notificationSettings,
      recipientLanguage: recipientUser.language,
    })

    if (result instanceof DeviceTokensNotRegisteredNotificationsServiceError) {
      await removeDeviceTokens({ userId: recipientUser.id, deviceTokens: result.tokens })
    }

    return true
  })
}
