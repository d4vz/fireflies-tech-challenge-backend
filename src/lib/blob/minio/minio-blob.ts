import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { parseSecrets } from "../../config/index.ts";
import type { Blob, PutBlob } from "../index.ts";

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

function isMissingKey(error: Error) {
  return error.name === "NoSuchKey" || error.name === "NotFound";
}

function contentLength(input: PutBlob) {
  if (input.size != null) {
    return input.size;
  }
  if (input.body instanceof Uint8Array) {
    return input.body.byteLength;
  }
  throw new Error("stream uploads require size");
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
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: new NodeHttpHandler({ requestTimeout: 0 }),
  });

  return {
    put: async (input) => {
      await ensureBucket(client, config.bucket);
      await new Upload({
        client,
        params: {
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentLength: contentLength(input),
          ContentType: input.contentType,
        },
      }).done();
      const base = config.publicEndpoint.replace(/\/$/, "");
      return `${base}/${config.bucket}/${input.key}`;
    },
    get: async (key) => {
      try {
        const stored = await client.send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
          }),
        );
        if (!stored.Body) {
          return undefined;
        }
        return {
          body: stored.Body.transformToWebStream(),
          contentType: stored.ContentType ?? "application/octet-stream",
        };
      } catch (error) {
        if (error instanceof Error && isMissingKey(error)) {
          return undefined;
        }
        throw error;
      }
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
