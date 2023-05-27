type OnChainError = import("./errors").OnChainError
type TransactionDecodeError = import("./errors").TransactionDecodeError
type OnChainServiceError = import("./errors").OnChainServiceError

type PayoutSpeed =
  typeof import("./index").PayoutSpeed[keyof typeof import("./index").PayoutSpeed]

type OnChainAddress = string & { readonly brand: unique symbol }
type BlockId = string & { readonly brand: unique symbol }
type OnChainTxHash = string & { readonly brand: unique symbol }
type PayoutId = string & { readonly brand: unique symbol }
type PayoutRequestId = string & { readonly brand: unique symbol }
type OnChainTxVout = number & { readonly brand: unique symbol }
type ScanDepth = number & { readonly brand: unique symbol }
type TxOut = {
  sats: Satoshis
  // OP_RETURN utxos don't have valid addresses associated with them
  address: OnChainAddress | null
  vout: OnChainTxVout
}

type OnChainTransaction = {
  txHash: OnChainTxHash
  outs: TxOut[]
}

type IncomingOnChainTransaction = {
  confirmations: number
  rawTx: OnChainTransaction
  fee: Satoshis
  createdAt: Date
  uniqueAddresses: () => OnChainAddress[]
}

type IncomingOnChainTransactionFromCache = {
  confirmations: number
  rawTx: OnChainTransaction
  fee: Satoshis
  createdAt: string
}

type OutgoingOnChainTransaction = {
  confirmations: number
  rawTx: OnChainTransaction
  fee: Satoshis
  createdAt: Date
  uniqueAddresses: () => OnChainAddress[]
}

type TxDecoder = {
  decode(txHex: string): OnChainTransaction
}

type TxFilterArgs = {
  confirmationsLessThan?: number
  confirmationsGreaterThanOrEqual?: number
  addresses?: OnChainAddress[]
}

type TxFilter = {
  apply(txs: IncomingOnChainTransaction[]): IncomingOnChainTransaction[]
}

type LookupOnChainFeeArgs = {
  txHash: OnChainTxHash
  scanDepth: ScanDepth
}

type GetOnChainFeeEstimateArgs = {
  amount: Satoshis
  address: OnChainAddress
  targetConfirmations: TargetConfirmations
}

type PayToAddressArgs = {
  amount: Satoshis
  address: OnChainAddress
  targetConfirmations: TargetConfirmations
  description?: string
}

type IncomingOnChainTxHandler = {
  balancesByAddresses(): { [key: OnChainAddress]: BtcPaymentAmount } | ValidationError
  balanceByWallet(
    wallets: Wallet[],
  ): { [key: WalletId]: BtcPaymentAmount } | ValidationError
}

interface IOnChainService {
  listActivePubkeys(): Pubkey[]

  getBalance(pubkey?: Pubkey): Promise<Satoshis | OnChainServiceError>

  getBalanceAmount(pubkey?: Pubkey): Promise<BtcPaymentAmount | OnChainServiceError>

  getPendingBalance(pubkey?: Pubkey): Promise<Satoshis | OnChainServiceError>

  listIncomingTransactions(
    scanDepth: ScanDepth,
  ): Promise<IncomingOnChainTransaction[] | OnChainServiceError>

  lookupOnChainFee({
    txHash,
    scanDepth,
  }: LookupOnChainFeeArgs): Promise<Satoshis | OnChainServiceError>

  createOnChainAddress(): Promise<OnChainAddressIdentifier | OnChainServiceError>

  getOnChainFeeEstimate({
    amount,
    address,
    targetConfirmations,
  }: GetOnChainFeeEstimateArgs): Promise<Satoshis | OnChainServiceError>

  payToAddress({
    amount,
    address,
    targetConfirmations,
  }: PayToAddressArgs): Promise<OnChainTxHash | OnChainServiceError>
}

type QueuePayoutToAddressArgs = {
  walletId: WalletId
  address: OnChainAddress
  amount: BtcPaymentAmount
  speed: PayoutSpeed
  externalId: string
}

type EstimatePayoutFeeArgs = {
  address: OnChainAddress
  amount: BtcPaymentAmount
  speed: PayoutSpeed
}

interface INewOnChainService {
  queuePayoutToAddress(
    args: QueuePayoutToAddressArgs,
  ): Promise<PayoutId | OnChainServiceError>
  estimatePayoutFee(
    args: EstimatePayoutFeeArgs,
  ): Promise<BtcPaymentAmount | OnChainServiceError>
}
