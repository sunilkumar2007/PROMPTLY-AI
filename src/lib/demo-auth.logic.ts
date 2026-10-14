/** Local demo auth is not a production authentication mechanism. */
export function isDevelopmentDemoToken(
  token: string | undefined,
  nodeEnvironment: string | undefined,
): boolean {
  return nodeEnvironment === "development" && token === "demo-token";
}
