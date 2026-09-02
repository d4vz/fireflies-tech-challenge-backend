import { z } from "zod";
import type { AppSettings } from "../../lib/config/index.ts";

function fileExtension(name: string) {
  const index = name.lastIndexOf(".");
  if (index === -1) {
    return "";
  }
  return name.slice(index + 1).toLowerCase();
}

function isAllowedFormat(file: File, rules: AppSettings["upload"]) {
  const extOk = rules.extensions.includes(fileExtension(file.name));
  const mimeOk = file.type.length > 0 && rules.mimeTypes.includes(file.type);
  return extOk || mimeOk;
}

export function uploadFileSchema(rules: AppSettings["upload"]) {
  return z
    .custom<File>((file) => file instanceof File, { error: "file is required" })
    .refine((file) => file.size <= rules.maxFileBytes, { error: "file must be 5 GB or smaller" })
    .refine((file) => isAllowedFormat(file, rules), { error: "file format is not supported" });
}

export function uploadFormSchema(rules: AppSettings["upload"]) {
  return z.object({
    file: uploadFileSchema(rules),
  });
}
