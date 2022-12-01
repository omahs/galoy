import { GT } from "@graphql/index"
import { connectionArgs } from "@graphql/connections"

import AccountLimits from "@graphql/types/object/account-limits"
import { TransactionConnection } from "@graphql/types/object/transaction"
import WalletId from "@graphql/types/scalar/wallet-id"
import AccountLimitsRange from "@graphql/types/scalar/account-limits-range"

import Wallet from "./wallet"

const IAccount = GT.Interface({
  name: "Account",
  fields: () => ({
    id: {
      type: GT.NonNullID,
    },
    wallets: {
      type: GT.NonNullList(Wallet),
    },
    defaultWalletId: {
      type: GT.NonNull(WalletId),
    },
    csvTransactions: {
      type: GT.NonNull(GT.String),
      args: {
        walletIds: {
          type: GT.NonNullList(WalletId),
        },
      },
    },
    limits: {
      type: GT.NonNull(AccountLimits),
      args: {
        range: {
          type: GT.NonNull(AccountLimitsRange),
        },
      },
    },
    transactions: {
      type: TransactionConnection,
      args: {
        ...connectionArgs,
        walletIds: {
          type: GT.List(WalletId),
        },
      },
    },

    // FUTURE-PLAN: Support a `users: [User!]!` field here
  }),
})

export default IAccount
