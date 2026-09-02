import { MongoClient } from "mongodb";
import { parseSecrets } from "../../config/index.ts";

let connecting: Promise<MongoClient> | undefined;

export function mongoFromEnv(): Promise<MongoClient> {
  if (connecting) {
    return connecting;
  }
  connecting = new MongoClient(parseSecrets(process.env).MONGODB_URI).connect();
  return connecting;
}
