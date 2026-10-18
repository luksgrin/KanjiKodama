/**
 * Server mode: URL normalize/label, API v2 types, pure parts of the sync engine. Java:
 * local/ServerMode, api/*. Fixtures: server/*.
 */
export {
  NOT_A_SERVER_ADDRESS,
  NOT_HTTP,
  ServerAddressError,
  WANIKANI_API_BASE_URL,
  isWaniKaniUrl,
  normalizeServerUrl,
  serverLabel,
} from './serverUrl';
export { UriSyntaxError, parseJavaUri, type ParsedUri } from './javaUri';
