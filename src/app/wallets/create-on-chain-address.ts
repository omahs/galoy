import { BTC_NETWORK } from "@config"

import {
  InvalidOnChainServiceStateError,
  OnChainAddressAlreadyCreatedForRequestIdError,
  TxDecoder,
} from "@domain/bitcoin/onchain"
import { RateLimitConfig } from "@domain/rate-limit"
import { RateLimiterExceededError } from "@domain/rate-limit/errors"
import { WalletCurrency } from "@domain/shared"

import { NewOnChainService } from "@services/bria"
import { WalletOnChainAddressesRepository, WalletsRepository } from "@services/mongoose"
import { OnChainService } from "@services/lnd/onchain-service"
import { consumeLimiter } from "@services/rate-limit"

import { validateIsBtcWallet, validateIsUsdWallet } from "./validate"

export const lndCreateOnChainAddress = async (
  walletId: WalletId,
): Promise<OnChainAddress | ApplicationError> => {
  const wallet = await WalletsRepository().findById(walletId)
  if (wallet instanceof Error) return wallet

  const limitOk = await checkOnChainAddressAccountIdLimits(wallet.accountId)
  if (limitOk instanceof Error) return limitOk

  const onChainService = OnChainService(TxDecoder(BTC_NETWORK))
  if (onChainService instanceof Error) return onChainService

  const onChainAddress = await onChainService.createOnChainAddress()
  if (onChainAddress instanceof Error) return onChainAddress

  const onChainAddressesRepo = WalletOnChainAddressesRepository()
  const savedOnChainAddress = await onChainAddressesRepo.persistNew({
    walletId,
    onChainAddress,
  })
  if (savedOnChainAddress instanceof Error) return savedOnChainAddress

  return savedOnChainAddress.address
}

const createOnChainAddress = async ({
  walletId,
  requestId,
}: {
  walletId: WalletId
  requestId?: OnChainAddressRequestId
}) => {
  const wallet = await WalletsRepository().findById(walletId)
  if (wallet instanceof Error) return wallet

  const limitOk = await checkOnChainAddressAccountIdLimits(wallet.accountId)
  if (limitOk instanceof Error) return limitOk

  const onChain = NewOnChainService()
  let onChainAddress = await onChain.createOnChainAddress(requestId)
  if (onChainAddress instanceof OnChainAddressAlreadyCreatedForRequestIdError) {
    const addresses = await onChain.listOnChainAddresses()
    if (addresses instanceof Error) return addresses

    const addressFromAddresses = addresses.find(
      ({ requestId: requestIdFromAddresses }) => requestIdFromAddresses === requestId,
    )
    if (addressFromAddresses === undefined) return new InvalidOnChainServiceStateError()
    onChainAddress = addressFromAddresses
  } else if (onChainAddress instanceof Error) {
    return onChainAddress
  }

  const onChainAddressesRepo = WalletOnChainAddressesRepository()
  const savedOnChainAddress = await onChainAddressesRepo.persistNew({
    walletId,
    onChainAddress,
  })
  if (savedOnChainAddress instanceof Error) return savedOnChainAddress

  return savedOnChainAddress.address
}

export const createOnChainAddressByWallet = async ({
  wallet,
  requestId,
}: {
  wallet: Wallet
  requestId?: OnChainAddressRequestId
}): Promise<OnChainAddress | ApplicationError> => {
  if (wallet.currency === WalletCurrency.Btc) {
    return createOnChainAddressForBtcWallet({ walletId: wallet.id, requestId })
  }

  return createOnChainAddressForUsdWallet({ walletId: wallet.id, requestId })
}

export const createOnChainAddressForBtcWallet = async ({
  walletId,
  requestId,
}: {
  walletId: WalletId
  requestId?: OnChainAddressRequestId
}): Promise<OnChainAddress | ApplicationError> => {
  const validated = await validateIsBtcWallet(walletId)
  return validated instanceof Error
    ? validated
    : createOnChainAddress({ walletId, requestId })
}

export const createOnChainAddressForUsdWallet = async ({
  walletId,
  requestId,
}: {
  walletId: WalletId
  requestId?: OnChainAddressRequestId
}): Promise<OnChainAddress | ApplicationError> => {
  const validated = await validateIsUsdWallet(walletId)
  return validated instanceof Error
    ? validated
    : createOnChainAddress({ walletId, requestId })
}

const checkOnChainAddressAccountIdLimits = async (
  accountId: AccountId,
): Promise<true | RateLimiterExceededError> =>
  consumeLimiter({
    rateLimitConfig: RateLimitConfig.onChainAddressCreate,
    keyToConsume: accountId,
  })
