type BriaEventError = import("./errors").BriaEventError

type ClientReadableStream<T> = import("@grpc/grpc-js").ClientReadableStream<T>

type BriaPayloadType =
  typeof import("./index").BriaPayloadType[keyof typeof import("./index").BriaPayloadType]

type AddressAugmentation = {
  address: OnChainAddress
  externalId: string
}

type BriaEventAugmentation = {
  addressInfo?: AddressAugmentation
}

type UtxoDetected = {
  type: "utxo_detected"
  txId: OnChainTxHash
  vout: OnChainTxVout
  satoshis: BtcPaymentAmount
  address: OnChainAddress
}
type UtxoSettled = {
  type: "utxo_settled"
  txId: OnChainTxHash
  vout: OnChainTxVout
  satoshis: BtcPaymentAmount
  address: OnChainAddress
  blockNumber: number
}
type PayoutSubmitted = {
  type: "payout_submitted"
  id: PayoutId
  satoshis: BtcPaymentAmount
}
type PayoutCommitted = {
  type: "payout_committed"
  id: PayoutId
  satoshis: BtcPaymentAmount
}
type PayoutBroadcast = {
  type: "payout_broadcast"
  id: PayoutId
  proportionalFee: BtcPaymentAmount
  satoshis: BtcPaymentAmount
  txId: OnChainTxHash
  vout: OnChainTxVout
  address: OnChainAddress
}
type PayoutSettled = {
  type: "payout_settled"
  id: PayoutId
  proportionalFee: BtcPaymentAmount
  satoshis: BtcPaymentAmount
  txId: OnChainTxHash
  vout: OnChainTxVout
  address: OnChainAddress
}
type BriaPayload =
  | UtxoDetected
  | UtxoSettled
  | PayoutSubmitted
  | PayoutCommitted
  | PayoutBroadcast
  | PayoutSettled
type BriaEvent = {
  payload: BriaPayload
  augmentation: BriaEventAugmentation | undefined
  sequence: number
}

type BriaEventHandler = (event: BriaEvent) => Promise<true | DomainError>

type BriaErrorHandler = (err: Error) => void
