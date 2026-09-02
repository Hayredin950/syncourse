import { post } from "./api";

/**
 * Browser-to-Cloudinary uploads for the admin console.
 *
 * The older path (`POST /images/upload` with a base64 data URL) still backs
 * avatars, but it cannot carry a video: the API caps a JSON body at 15 MB and
 * base64 inflates by a third, so the real ceiling is around 11 MB. Here the API
 * only signs the request and the bytes go straight from the browser to
 * Cloudinary — no body limit, nothing crossing our own server, and a progress
 * number the UI can actually show.
 *
 * XHR rather than fetch, because `upload.onprogress` is the only reliable way
 * to report progress on a request body in browsers today.
 */
export type UploadKind = "image" | "video" | "file";

interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: string;
  folder: string;
  signature: string;
  resourceType: string;
  uploadUrl: string;
}

export interface Uploaded {
  url: string;
  publicId: string;
  bytes: number;
  format: string | null;
}

/** Accept lists for the file picker, matched to the buckets the API signs. */
export const ACCEPT: Record<UploadKind, string> = {
  image: "image/*",
  video: "video/*",
  file: "*/*",
};

export async function uploadFile(
  file: File,
  kind: UploadKind,
  onProgress?: (percent: number) => void,
): Promise<Uploaded> {
  const sig = await post<UploadSignature>("/admin/uploads/sign", { kind });

  const form = new FormData();
  // Order does not matter to Cloudinary, but every signed parameter must be
  // present and identical to what the server signed — folder and timestamp.
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", sig.timestamp);
  form.append("folder", sig.folder);
  form.append("signature", sig.signature);

  const json = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", sig.uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        // Cloudinary answers HTML on a few infrastructure errors.
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
      // Surface Cloudinary's own wording — it is the only place that knows the
      // account's real size limits, which its docs do not publish per plan.
      const err = body.error as { message?: string } | undefined;
      reject(new Error(err?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(form);
  });

  const url = (json.secure_url ?? json.url) as string | undefined;
  if (!url) throw new Error("Cloudinary did not return a URL");
  return {
    url,
    publicId: (json.public_id as string) ?? "",
    bytes: (json.bytes as number) ?? file.size,
    format: (json.format as string) ?? null,
  };
}

/** "4.2 MB" — for upload hints and file lists. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
