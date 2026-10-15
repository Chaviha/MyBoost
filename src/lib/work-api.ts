import { useCallback, useEffect, useState } from "react";
import type { JobStatus } from "./types";

export type WorkJob = {
  job_id: string;
  business_id: string;
  business_name: string;
  title: string;
  description: string;
  start_date: string;
  due_date: string;
  status: JobStatus;
  role: "employee" | "customer";
  estimated_cost: number;
  status_updated_at: string;
};

export type RequestKind = "Progress update" | "Money" | "Question" | "Other";
export type WorkRequestStatus = "Pending" | "Approved" | "Rejected" | "Acknowledged";
export type RequestImage = { name: string; url: string };
export type WorkRequestMessage = {
  message_id: string;
  user_id: string;
  user_name: string;
  body: string;
  images: RequestImage[];
  created_at: string;
};
export type WorkRequest = {
  request_id: string;
  business_id: string;
  business_name: string;
  job_id: string;
  job_title: string;
  kind: RequestKind;
  amount: number;
  body: string;
  images: RequestImage[];
  status: WorkRequestStatus;
  from_user_id: string;
  from_name: string;
  from_role: "employee" | "customer";
  owner_user_id: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
  messages: WorkRequestMessage[];
};
export type WorkTarget = {
  business_id: string;
  business_name: string;
  role: "employee" | "customer";
  jobs: { job_id: string; title: string; status: JobStatus }[];
};
export type PickedImage = { name: string; data_url: string };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong. Try again.");
  return data as T;
}

export const workApi = {
  jobs: () => call<{ jobs: WorkJob[] }>("/api/work/jobs").then((d) => d.jobs),
  setJobStatus: (jobId: string, status: JobStatus) =>
    call<{ job: WorkJob }>(`/api/work/jobs/${encodeURIComponent(jobId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }).then((d) => d.job),
  targets: () => call<{ targets: WorkTarget[] }>("/api/work/targets").then((d) => d.targets),
  requests: () => call<{ requests: WorkRequest[] }>("/api/work/requests").then((d) => d.requests),
  createRequest: (body: {
    businessId: string;
    role: "employee" | "customer";
    jobId?: string;
    kind: RequestKind;
    amount?: number;
    body: string;
    images: PickedImage[];
  }) =>
    call<{ requests: WorkRequest[] }>("/api/work/requests", { method: "POST", body: JSON.stringify(body) }).then(
      (d) => d.requests,
    ),
  reply: (requestId: string, body: string, images: PickedImage[]) =>
    call<{ requests: WorkRequest[] }>(`/api/work/requests/${encodeURIComponent(requestId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, images }),
    }).then((d) => d.requests),
  decide: (requestId: string, status: Exclude<WorkRequestStatus, "Pending">) =>
    call<{ requests: WorkRequest[] }>(`/api/work/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).then((d) => d.requests),
};

/** Reads image files into data URLs (max 6, images only). */
export function readImages(files: FileList | File[] | null, limit = 6): Promise<PickedImage[]> {
  const list = Array.from(files || [])
    .filter((f) => f.type.startsWith("image/"))
    .slice(0, limit);
  return Promise.all(
    list.map(
      (file) =>
        new Promise<PickedImage>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, data_url: String(reader.result) });
          reader.onerror = () => reject(new Error("Could not read the image."));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

/** Loads something from the work API, refreshing every 20s and when the tab regains focus. */
export function useWorkData<T>(loader: () => Promise<T>, initial: T, enabled = true) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await loader());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
    const id = window.setInterval(() => void load(), 20000);
    const onFocus = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, load]);
  return { data, setData, loading, error, reload: load };
}
