import { readFileSync } from "fs"

import dotenv from "dotenv"
// import { applyMiddleware } from "graphql-middleware"
import { shield } from "graphql-shield"
import { Rule } from "graphql-shield/typings/rules"

import { bootstrap } from "@app/bootstrap"

import { setupMongoConnection } from "@services/mongodb"
import { activateLndHealthCheck } from "@services/lnd/health"
import { baseLogger } from "@services/logger"

import { GALOY_API_PORT } from "@config"
import { buildFederatedSchema } from "@graphql/federation/build-federated-schema"

import { gqlMainSchema, mutationFields, queryFields } from "@graphql/main"

import { isAuthenticated, startApolloServer } from "./graphql-server"
import { walletIdMiddleware } from "./middlewares/wallet-id"
import { startApolloServerForAdminSchema } from "./graphql-admin-server"

const graphqlLogger = baseLogger.child({ module: "graphql" })

dotenv.config()

export async function startApolloServerForCoreSchema() {
  const authedQueryFields: { [key: string]: Rule } = {}
  for (const key of Object.keys({
    ...queryFields.authed.atAccountLevel,
    ...queryFields.authed.atWalletLevel,
  })) {
    authedQueryFields[key] = isAuthenticated
  }

  const authedMutationFields: { [key: string]: Rule } = {}
  for (const key of Object.keys({
    ...mutationFields.authed.atAccountLevel,
    ...mutationFields.authed.atWalletLevel,
  })) {
    authedMutationFields[key] = isAuthenticated
  }

  const permissions = shield(
    {
      Query: authedQueryFields,
      Mutation: authedMutationFields,
    },
    { allowExternalErrors: true },
  )

  // const schema = applyMiddleware(gqlMainSchema, permissions, walletIdMiddleware)
  const federationExtendTypes = readFileSync(
    `${__dirname}/../graphql/federation/federated-entities.graphql`,
  ).toString("utf-8")
  const federationLinks = readFileSync(
    `${__dirname}/../graphql/federation/federated-links.graphql`,
  ).toString("utf-8")
  const schema = buildFederatedSchema(
    gqlMainSchema,
    permissions,
    walletIdMiddleware,
    federationExtendTypes,
    federationLinks,
  )

  return startApolloServer({
    schema,
    port: GALOY_API_PORT,
    type: "main",
  })
}

if (require.main === module) {
  setupMongoConnection(true)
    .then(async () => {
      activateLndHealthCheck()
      await bootstrap()
      await Promise.race([
        startApolloServerForCoreSchema(),
        startApolloServerForAdminSchema(),
      ])
    })
    .catch((err) => graphqlLogger.error(err, "server error"))
}
