// Re-export from open-sse with worker logger
import {
  TOKEN_EXPIRY_BUFFER_MS as BUFFER_MS,
  refreshTokenByProvider as _refreshTokenByProvider,
} from "domain/services/tokenRefresh.js";

import * as log from "../utils/logger.js";

export const TOKEN_EXPIRY_BUFFER_MS = BUFFER_MS;

export const refreshTokenByProvider = (provider, credentials) =>
  _refreshTokenByProvider(provider, credentials, log);
