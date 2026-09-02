import { MongoClient } from "mongodb";

let connecting: Promise<MongoClient> | undefined;

export function mongoFromEnv(): Promise<MongoClient> {
  if (connecting) {
    return connecting;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }
  connecting = new MongoClient(uri).connect();
  return connecting;
}
