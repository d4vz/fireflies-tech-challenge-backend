import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { parseSecrets } from "../../config/index.ts";
import type { Blob } from "../index.ts";

export type MinioBlobConfig = {
  endpoint: string;
  publicEndpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
};

async function ensureBucket(client: S3Client, bucket: string) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export function createMinioBlob(config: MinioBlobConfig): Blob {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true,
  });

  return {
    put: async (input) => {
      await ensureBucket(client, config.bucket);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
      const base = config.publicEndpoint.replace(/\/$/, "");
      return `${base}/${config.bucket}/${input.key}`;
    },
    ping: () => ensureBucket(client, config.bucket),
  };
}

export function minioBlobFromEnv(): Blob {
  const secrets = parseSecrets(process.env);
  return createMinioBlob({
    endpoint: secrets.S3_ENDPOINT,
    publicEndpoint: secrets.S3_PUBLIC_ENDPOINT ?? secrets.S3_ENDPOINT,
    accessKey: secrets.S3_ACCESS_KEY,
    secretKey: secrets.S3_SECRET_KEY,
    bucket: secrets.S3_BUCKET,
    region: secrets.S3_REGION,
  });
}
