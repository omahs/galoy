/**
 * how to run:
 *
 * Make sure there's a file named reimbursements.json in src/debug
 * following the structure:
 * {
 *  "feeUpdateOperations" = [
 *    { "walletId": "first-wallet-id", fee: 13 },
 *    { "walletId": "second-wallet-id", fee: 10 },
 *  ]
 * }
 * . ./.envrc && yarn ts-node --files -r tsconfig-paths/register src/debug/reimburse.ts
 */

import { intraledgerPaymentSendWalletId } from "@app/wallets"
import { checkedToSats } from "@domain/bitcoin"
import { checkedToWalletId } from "@domain/wallets"
import { getBankOwnerWalletId } from "@services/ledger/accounts"
import { baseLogger } from "@services/logger"
import { setupMongoConnection } from "@services/mongodb"
import { reimbursements } from "./reimbursements.json"

type reimbursement = {
  recipientWalletId: string
  amount: number
  memo: string
}

const reimburse = async (reimbursements: Array<reimbursement>) => {
  await setupMongoConnection()
  console.log("Mongoose connection ready")
  const bankOwnerWalletId = await getBankOwnerWalletId()

  for (const reimbursement of reimbursements) {
    const recipientWalletId = checkedToWalletId(reimbursement.recipientWalletId)
    if (recipientWalletId instanceof Error) {
      console.error(`Invalid walletId: ${recipientWalletId}`)
      continue
    }

    const amount = checkedToSats(reimbursement.amount)

    if (amount instanceof Error) {
      console.error(`Invalid amount: ${amount}`)
      continue
    }

    const reimburseResult = await intraledgerPaymentSendWalletId({
      recipientWalletId,
      amount,
      logger: baseLogger,
      senderWalletId: bankOwnerWalletId,
      memo: reimbursement.memo,
    })
    console.log({ ...reimbursement, reimbursementStatus: reimburseResult })
  }
}

reimburse(reimbursements).then(console.log).catch(console.error)
