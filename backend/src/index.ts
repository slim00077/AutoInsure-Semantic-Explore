import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

createApp().listen(config.port, () => {
  logger.info(`API AutoInsure prête sur http://localhost:${config.port}/api (service sémantique : ${config.semanticUrl})`);
});
