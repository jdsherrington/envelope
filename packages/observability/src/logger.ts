import pino from "pino";

const level = process.env["NODE_ENV"] === "development" ? "debug" : "info";

export const logger = pino({
  level,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const childLogger = (context: Record<string, unknown>) => logger.child(context);
