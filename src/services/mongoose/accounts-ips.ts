import { AccountIps } from "@services/mongoose/schema"

import {
  CouldNotFindError,
  CouldNotFindUserFromIdError,
  PersistError,
  RepositoryError,
} from "@domain/errors"

import { fromObjectId, toObjectId, parseRepositoryError } from "./utils"

interface UpdateQuery {
  $set: {
    lastConnection: Date
    metadata?: IPType
  }
}

export const AccountsIpsRepository = (): IAccountsIPsRepository => {
  const update = async (
    accountIp: AccountIP | AccountIPNew,
  ): Promise<true | RepositoryError> => {
    const updateQuery: UpdateQuery = {
      $set: {
        lastConnection: new Date(),
      },
    }

    if (accountIp.metadata) {
      updateQuery.$set.metadata = accountIp.metadata
    }

    try {
      const result = await AccountIps.updateOne(
        { _accountId: toObjectId<AccountId>(accountIp.accountId), ip: accountIp.ip },
        updateQuery,
      )

      if (result.matchedCount === 0) {
        return new CouldNotFindError("Couldn't find accountIp")
      }

      if (result.modifiedCount !== 1) {
        return new PersistError("Couldn't update ip for accountIp")
      }

      return true
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const findByAccountIdAndIp = async ({
    accountId,
    ip,
  }: FindByAccountIdAndIpInput): Promise<AccountIP | RepositoryError> => {
    try {
      const result = await AccountIps.findOne({
        _accountId: toObjectId<AccountId>(accountId),
        ip,
      })
      if (!result) {
        return new CouldNotFindUserFromIdError(accountId)
      }

      return accountIPFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const lastByAccountId = async (
    accountId: AccountId,
  ): Promise<AccountIP | RepositoryError> => {
    try {
      const result = await AccountIps.findOne({
        _accountId: toObjectId<AccountId>(accountId),
      }).sort({ lastConnection: -1 })

      if (!result) {
        return new CouldNotFindUserFromIdError(accountId)
      }

      return accountIPFromRaw(result)
    } catch (error) {
      return parseRepositoryError(error)
    }
  }

  return {
    update,
    lastByAccountId,
    findByAccountIdAndIp,
  }
}

const accountIPFromRaw = (result: AccountIpsRecord): AccountIP => {
  return {
    accountId: fromObjectId<AccountId>(result._accountId),
    ip: result.ip as IpAddress,
    metadata: result.metadata as IPType,
  }
}
