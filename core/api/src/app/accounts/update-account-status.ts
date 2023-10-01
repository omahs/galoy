import { checkedAccountStatus, checkedToAccountId } from "@/domain/accounts"
import { AccountsRepository } from "@/services/mongoose"

export const updateAccountStatus = async ({
  id: idRaw,
  status,
  updatedByAuditorId,
  comment,
}: {
  id: string
  status: string
  updatedByAuditorId: AuditorId
  comment?: string
}): Promise<Account | ApplicationError> => {
  const accountsRepo = AccountsRepository()

  const id = checkedToAccountId(idRaw)
  if (id instanceof Error) return id

  const account = await accountsRepo.findById(id)
  if (account instanceof Error) return account

  const statusChecked = checkedAccountStatus(status)
  if (statusChecked instanceof Error) return statusChecked

  account.statusHistory = (account.statusHistory ?? []).concat({
    status: statusChecked,
    updatedByAuditorId,
    comment,
  })
  return accountsRepo.update(account)
}
