declare const ledgerAccountUuid: unique symbol
type LedgerAccountUuid = string & { [ledgerAccountUuid]: never }

type TxMetadata = Record<
  string,
  | string // TODO: add branded type for memo/memoPayer/memoFromPayer and remove this
  | DisplayCurrency
  | Username
  | Satoshis
  | UsdCents
  | DisplayCurrencyBaseAmount
  | boolean
  | OnChainAddress[]
  | OnChainTxVout
  | undefined
>

type LedgerAccountDescriptor<T extends WalletCurrency> = {
  id: LedgerAccountUuid
  currency: T
}

type MediciEntry = import("../books").MediciEntryFromPackage<ILedgerTransaction>

type StaticAccountUuids = {
  bankOwnerAccountUuid: LedgerAccountUuid
  dealerBtcAccountUuid: LedgerAccountUuid
  dealerUsdAccountUuid: LedgerAccountUuid
}

type EntryBuilderConfig<M extends MediciEntry> = {
  entry: M
  staticAccountUuids: StaticAccountUuids
  metadata: TxMetadata
  additionalInternalMetadata: TxMetadata
}

type EntryBuilderFeeState<M extends MediciEntry> = {
  entry: M
  metadata: TxMetadata
  additionalInternalMetadata: TxMetadata
  staticAccountUuids: StaticAccountUuids
  amountWithFees: {
    usdWithFees: UsdPaymentAmount
    btcWithFees: BtcPaymentAmount
  }
}

type EntryBuilderFee<M extends MediciEntry> = {
  withBankFee: ({
    btcBankFee,
    usdBankFee,
  }: {
    btcBankFee: BtcPaymentAmount
    usdBankFee: UsdPaymentAmount
  }) => EntryBuilderDebit<M>
}

type EntryBuilderDebitState<M extends MediciEntry> = {
  entry: M
  metadata: TxMetadata
  additionalInternalMetadata: TxMetadata
  staticAccountUuids: StaticAccountUuids
  amountWithFees: {
    usdWithFees: UsdPaymentAmount
    btcWithFees: BtcPaymentAmount
  }
  bankFee: {
    btcBankFee: BtcPaymentAmount
    usdBankFee: UsdPaymentAmount
  }
}

type EntryBuilderDebit<M extends MediciEntry> = {
  debitAccount: <D extends WalletCurrency>({
    accountDescriptor,
    additionalMetadata,
  }: {
    accountDescriptor: LedgerAccountDescriptor<D>
    additionalMetadata: TxMetadata
  }) => EntryBuilderCredit<M>
  debitLnd: () => EntryBuilderCredit<M>
  debitOnChain: () => EntryBuilderCredit<M>
  debitColdStorage: () => EntryBuilderCredit<M>
}

type EntryBuilderCreditState<M extends MediciEntry> = {
  entry: M
  metadata: TxMetadata
  additionalInternalMetadata: TxMetadata
  debitCurrency: WalletCurrency
  amountWithFees: {
    usdWithFees: UsdPaymentAmount
    btcWithFees: BtcPaymentAmount
  }
  bankFee: {
    usdBankFee: UsdPaymentAmount
    btcBankFee: BtcPaymentAmount
  }
  staticAccountUuids: {
    dealerBtcAccountUuid: LedgerAccountUuid
    dealerUsdAccountUuid: LedgerAccountUuid
  }
}

type EntryBuilderCredit<M extends MediciEntry> = {
  creditOffChain: () => M
  creditOnChain: () => M
  creditColdStorage: () => M
  creditAccount: <C extends WalletCurrency>({
    accountDescriptor,
    additionalMetadata,
  }: {
    accountDescriptor: LedgerAccountDescriptor<C>
    additionalMetadata: TxMetadata
  }) => M
}

type FeeOnlyEntryBuilderConfig<M extends MediciEntry> = {
  entry: M
  metadata: TxMetadata
  staticAccountUuids: {
    bankOwnerAccountUuid: LedgerAccountUuid
  }
  btcFee: BtcPaymentAmount
}

type FeeOnlyEntryBuilderDebit<M extends MediciEntry> = {
  debitBankOwner: () => FeeOnlyEntryBuilderCredit<M>
  debitOnChain: () => FeeOnlyEntryBuilderCredit<M>
}

type FeeOnlyEntryBuilderCredit<M extends MediciEntry> = {
  creditBankOwner: () => M
  creditOnChain: () => M
}

type BaseLedgerTransactionMetadata = {
  id: LedgerTransactionId
}

type OnChainLedgerTransactionMetadataUpdate = {
  hash: OnChainTxHash
}

type LnLedgerTransactionMetadataUpdate = {
  hash: PaymentHash
  revealedPreImage?: RevealedPreImage
}

type SwapTransactionMetadataUpdate = {
  hash: SwapHash
  swapAmount: number
  swapId: SwapId
  htlcAddress: OnChainAddress
  onchainMinerFee: number
  offchainRoutingFee: number
  serviceProviderFee: number
  serviceProvider: string
  currency: WalletCurrency
  type: LedgerTransactionType
}

// Repeating 'id' key because can't figure out how to type an empty object
// and have it still work with the '&' below.
type IntraledgerLedgerTransactionMetadataUpdate = { id: LedgerTransactionId }

type LedgerTransactionMetadata = BaseLedgerTransactionMetadata &
  (
    | OnChainLedgerTransactionMetadataUpdate
    | LnLedgerTransactionMetadataUpdate
    | IntraledgerLedgerTransactionMetadataUpdate
    | SwapTransactionMetadataUpdate
  )

interface ITransactionsMetadataRepository {
  updateByHash(
    ledgerTxMetadata:
      | OnChainLedgerTransactionMetadataUpdate
      | LnLedgerTransactionMetadataUpdate,
  ): Promise<true | RepositoryError>

  persistAll(
    ledgerTxsMetadata: LedgerTransactionMetadata[],
  ): Promise<LedgerTransactionMetadata[] | RepositoryError>

  findById(id: LedgerTransactionId): Promise<LedgerTransactionMetadata | RepositoryError>

  findByHash(
    hash: PaymentHash | OnChainTxHash | SwapHash,
  ): Promise<LedgerTransactionMetadata | RepositoryError>

  listByIds(
    ids: LedgerTransactionId[],
  ): Promise<(LedgerTransactionMetadata | RepositoryError)[] | RepositoryError>
}
