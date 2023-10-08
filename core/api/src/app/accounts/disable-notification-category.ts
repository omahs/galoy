import {
  checkedToNotificationCategory,
  disableNotificationCategory as domainDisableNotificationCategory,
} from "@/domain/notifications"
import { AccountsRepository } from "@/services/mongoose"

export const disableNotificationCategory = async ({
  accountUuid,
  notificationChannel,
  notificationCategory,
}: {
  accountUuid: AccountUuid
  notificationChannel?: NotificationChannel
  notificationCategory: string
}): Promise<Account | ApplicationError> => {
  const checkedNotificationCategory = checkedToNotificationCategory(notificationCategory)
  if (checkedNotificationCategory instanceof Error) return checkedNotificationCategory

  const account = await AccountsRepository().findByUuid(accountUuid)
  if (account instanceof Error) return account

  const newNotificationSettings = domainDisableNotificationCategory({
    notificationSettings: account.notificationSettings,
    notificationChannel,
    notificationCategory: checkedNotificationCategory,
  })

  account.notificationSettings = newNotificationSettings

  return AccountsRepository().update(account)
}
