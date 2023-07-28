import {
  lexicographicSortSchema,
  extendSchema,
  parse,
  printSchema,
  GraphQLSchema,
} from "graphql"

import { buildSubgraphSchema } from "@apollo/subgraph"

import { makeExecutableSchema } from "@graphql-tools/schema"

import { getResolversFromSchema } from "@graphql-tools/utils"

import { IMiddlewareGenerator, applyMiddleware } from "graphql-middleware"

/**
 * Builds the GraphQLSchema by extending it with the
 * fedederation.graphql for Apollo Federation. It also applies the middleware
 * @example const schema = buildFederationSchema(
      gqlMainSchema,
      permissions,
      walletIdMiddleware,
      federationExtendTypes,
  )
 * @param schemaInput
 * @param permissions
 * @param walletIdMiddleware
 * @param federationExtendTypes see https://www.apollographql.com/docs/enterprise-guide/federated-schema-design/
 *   @example extend type User @key(fields: "id")
 *
 * @returns GraphQLSchemaWithFragmentReplacements
 */
export function buildFederatedSchema(
  schemaInput: GraphQLSchema,
  permissions: IMiddlewareGenerator<any, any, any>,
  walletIdMiddleware: any,
  federationExtendTypes: string,
) {
  let schemaString = printSchema(lexicographicSortSchema(schemaInput))
  const linkString = `extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@shareable", "@inaccessible", "@override", "@external", "@provides", "@requires", "@interfaceObject" ])\n `
  schemaString = linkString + schemaString
  const parsedSDL = parse(schemaString)
  const resolvers = getResolversFromSchema(schemaInput)
  const subgraphSchema = buildSubgraphSchema(parsedSDL)
  const executableSchema = makeExecutableSchema({ typeDefs: subgraphSchema, resolvers })
  let schema = applyMiddleware(executableSchema, permissions, walletIdMiddleware)
  // https://github.com/graphql/graphql-js/issues/1478#issuecomment-415862812
  schema = extendSchema(schema, parse(federationExtendTypes), { assumeValidSDL: true })
  // inject new federated schema
  return schema
}
