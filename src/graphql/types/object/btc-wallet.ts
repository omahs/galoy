import { GT } from "@graphql/index"
import { connectionArgs, connectionFromArray } from "@graphql/connections"
import { mapError } from "@graphql/error-map"

import { Wallets } from "@app"

import { WalletCurrency as WalletCurrencyDomain } from "@domain/shared"

import { InputValidationError } from "@graphql/error"

import IWallet from "../abstract/wallet"

import SignedAmount from "../scalar/signed-amount"
import WalletCurrency from "../scalar/wallet-currency"
import OnChainAddress from "../scalar/on-chain-address"

import { TransactionConnection } from "./transaction"

const BtcWallet = GT.Object<Wallet>({
  name: "BTCWallet",
  description:
    "A wallet belonging to an account which contains a BTC balance and a list of transactions.",
  interfaces: () => [IWallet],
  isTypeOf: (source) => source.currency === WalletCurrencyDomain.Btc,
  fields: () => ({
    id: {
      type: GT.NonNullID,
    },
    accountId: {
      type: GT.NonNullID,
    },
    walletCurrency: {
      type: GT.NonNull(WalletCurrency),
      resolve: (source) => source.currency,
    },
    balance: {
      type: GT.NonNull(SignedAmount),
      description: "A balance stored in BTC.",
      resolve: async (source, args, { logger }) => {
        const balanceSats = await Wallets.getBalanceForWallet({
          walletId: source.id,
          logger,
        })
        if (balanceSats instanceof Error) throw mapError(balanceSats)
        return balanceSats
      },
    },
    transactions: {
      type: TransactionConnection,
      args: { ...connectionArgs, addresses: { type: GT.List(OnChainAddress) } },
      resolve: async (source, args) => {
        let { addresses } = args
        if (addresses) {
          addresses = addresses.length ? addresses : source.onChainAddresses()
          for (const address of addresses) {
            if (address instanceof InputValidationError) throw address
          }

          const { result: transactions, error } =
            await Wallets.getTransactionsForWalletsByAddresses({
              wallets: [source],
              addresses,
            })
          if (error instanceof Error) throw mapError(error)
          if (transactions === null) throw error
          return connectionFromArray<WalletTransaction>(transactions, args)
        }

        const { result: transactions, error } = await Wallets.getTransactionsForWallets([
          source,
        ])
        if (error instanceof Error) throw mapError(error)
        if (transactions === null) throw error
        return connectionFromArray<WalletTransaction>(transactions, args)
      },
      description: "A list of BTC transactions associated with this wallet.",
    },
  }),
})

export default BtcWallet
