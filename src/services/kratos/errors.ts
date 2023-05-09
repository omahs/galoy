import { AuthenticationError } from "@domain/authentication/errors"
import { ErrorLevel } from "@domain/shared"

export class KratosError extends AuthenticationError {}
export class AuthenticationKratosError extends KratosError {}
export class ExtendSessionKratosError extends KratosError {}

export class PhoneAccountAlreadyExists extends KratosError {
  level = ErrorLevel.Info
}

export class PhoneAccountAlreadyExistsNeedToSweepFunds extends KratosError {
  level = ErrorLevel.Info
}

export class MissingCreatedAtKratosError extends KratosError {
  level = ErrorLevel.Critical
}

export class MissingExpiredAtKratosError extends KratosError {
  level = ErrorLevel.Critical
}

export class MissingTotpKratosError extends KratosError {
  level = ErrorLevel.Critical
}

export class IncompatibleSchemaUpgradeError extends KratosError {
  level = ErrorLevel.Critical
}

export class UnknownKratosError extends KratosError {
  level = ErrorLevel.Critical
}
