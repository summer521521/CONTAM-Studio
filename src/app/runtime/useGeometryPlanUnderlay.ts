import { useCallback, useEffect, useRef, useState } from "react";
import { readGeometryUnderlayResource, selectAndImportGeometryUnderlay } from "../desktop-api";
import type { AttachmentView } from "../attachment-state";
import {
  createPlanUnderlay,
  isSafeGeometryUnderlayResource,
  type GeometryUnderlayResource,
} from "../geometry/geometry-plan-underlay";
import type { GeometryPlanUnderlay } from "../geometry/geometry-model";
import type { GeometryOperationInput } from "./useGeometryWorkbench";

export type GeometryUnderlayImage = HTMLImageElement | HTMLCanvasElement;

export interface GeometryPlanUnderlayState {
  status: "idle" | "importing" | "loading" | "ready" | "error";
  image: GeometryUnderlayImage | null;
  pageCount: number | null;
  issue: string | null;
}

interface UseGeometryPlanUnderlayOptions {
  projectSessionId: string | null;
  revisionId: string | null;
  levelId: string | null;
  underlay: GeometryPlanUnderlay | null;
  commitOperations: (operations: GeometryOperationInput[]) => boolean;
  onAttachmentsImported: (attachments: AttachmentView[]) => void;
}

interface RenderedUnderlay {
  image: GeometryUnderlayImage;
  width: number;
  height: number;
  pageCount: number | null;
  release: () => void;
}

const MAX_RENDER_AXIS = 4_096;

function freshId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${prefix}-${randomUuid}`;
  const entropy = new Uint32Array(4);
  globalThis.crypto?.getRandomValues?.(entropy);
  const suffix = Array.from(entropy, (value) => value.toString(16).padStart(8, "0")).join("");
  return `${prefix}-${suffix || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`}`;
}

async function renderImage(bytes: Uint8Array, mimeType: "image/png" | "image/jpeg"): Promise<RenderedUnderlay> {
  const blob = new Blob([bytes.slice().buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    if (typeof image.decode === "function") await image.decode();
    else await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("geometry_underlay_image_decode_failed"));
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 20_000 || image.naturalHeight > 20_000) {
    URL.revokeObjectURL(url);
    throw new Error("geometry_underlay_image_dimensions_invalid");
  }
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    pageCount: null,
    release: () => URL.revokeObjectURL(url),
  };
}

async function renderPdf(bytes: Uint8Array, pageNumber: number): Promise<RenderedUnderlay> {
  const [pdfjs, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
  const pdfDocument = await loadingTask.promise;
  const pageCount = pdfDocument.numPages;
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    await loadingTask.destroy();
    throw new Error("geometry_underlay_pdf_page_invalid");
  }
  const page = await pdfDocument.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, MAX_RENDER_AXIS / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale });
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    await loadingTask.destroy();
    throw new Error("geometry_underlay_pdf_canvas_unavailable");
  }
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  page.cleanup();
  await pdfDocument.cleanup();
  await loadingTask.destroy();
  return {
    image: canvas,
    width: canvas.width,
    height: canvas.height,
    pageCount,
    release: () => undefined,
  };
}

async function loadRenderedResource(
  projectSessionId: string,
  revisionId: string,
  resource: GeometryUnderlayResource | GeometryPlanUnderlay,
  pageNumber: number | null,
): Promise<RenderedUnderlay> {
  const bytes = await readGeometryUnderlayResource(
    freshId("geometry-underlay-read"),
    projectSessionId,
    revisionId,
    resource.resource_id,
    resource.sha256,
    resource.mime_type,
  );
  if (resource.mime_type === "application/pdf") return renderPdf(bytes, pageNumber ?? 1);
  return renderImage(bytes, resource.mime_type);
}

export function useGeometryPlanUnderlay(options: UseGeometryPlanUnderlayOptions) {
  const {
    projectSessionId,
    revisionId,
    levelId,
    underlay,
    commitOperations,
    onAttachmentsImported,
  } = options;
  const [state, setState] = useState<GeometryPlanUnderlayState>({
    status: "idle",
    image: null,
    pageCount: null,
    issue: null,
  });
  const generation = useRef(0);
  const contextKey = `${projectSessionId ?? "none"}:${revisionId ?? "none"}:${levelId ?? "none"}`;
  const activeContextKey = useRef(contextKey);
  activeContextKey.current = contextKey;

  useEffect(() => {
    const currentGeneration = ++generation.current;
    if (!projectSessionId || !revisionId || !underlay?.visible) {
      setState({ status: "idle", image: null, pageCount: null, issue: null });
      return undefined;
    }
    let release: () => void = () => undefined;
    setState((current) => ({ ...current, status: "loading", image: null, issue: null }));
    void loadRenderedResource(projectSessionId, revisionId, underlay, underlay.page_number)
      .then((rendered) => {
        if (generation.current !== currentGeneration) {
          rendered.release();
          return;
        }
        release = rendered.release;
        setState({ status: "ready", image: rendered.image, pageCount: rendered.pageCount, issue: null });
      })
      .catch((error: unknown) => {
        if (generation.current !== currentGeneration) return;
        setState({
          status: "error",
          image: null,
          pageCount: null,
          issue: error instanceof Error ? error.message : "geometry_underlay_read_failed",
        });
      });
    return () => {
      release();
    };
  }, [contextKey, projectSessionId, revisionId, underlay?.mime_type, underlay?.page_number, underlay?.resource_id, underlay?.sha256, underlay?.visible]);

  const importUnderlay = useCallback(async (): Promise<boolean> => {
    if (!projectSessionId || !revisionId || !levelId || underlay || state.status === "importing") return false;
    const expectedContextKey = activeContextKey.current;
    const requestId = freshId("geometry-underlay-import");
    setState({ status: "importing", image: null, pageCount: null, issue: null });
    try {
      const response = await selectAndImportGeometryUnderlay(requestId, projectSessionId, revisionId);
      if (activeContextKey.current !== expectedContextKey) return false;
      if (response.request_id !== requestId
        || response.project_session_id !== projectSessionId
        || response.revision_id !== revisionId
        || response.error
        || response.cancelled) {
        if (response.cancelled) setState({ status: "idle", image: null, pageCount: null, issue: null });
        else setState({ status: "error", image: null, pageCount: null, issue: response.error?.code ?? "geometry_underlay_import_invalid" });
        return false;
      }
      if (!isSafeGeometryUnderlayResource(response.resource)) {
        setState({ status: "error", image: null, pageCount: null, issue: "geometry_underlay_import_invalid" });
        return false;
      }
      onAttachmentsImported(response.attachments);
      const pageNumber = response.resource.mime_type === "application/pdf" ? 1 : null;
      const rendered = await loadRenderedResource(projectSessionId, revisionId, response.resource, pageNumber);
      if (activeContextKey.current !== expectedContextKey) {
        rendered.release();
        return false;
      }
      const nextUnderlay = createPlanUnderlay(response.resource, rendered.width, rendered.height, pageNumber);
      if (!nextUnderlay || !commitOperations([{
        operation: "set_plan_underlay",
        parameters: { level_id: levelId, underlay: nextUnderlay },
      }])) {
        rendered.release();
        setState({ status: "error", image: null, pageCount: null, issue: "geometry_underlay_commit_failed" });
        return false;
      }
      rendered.release();
      setState({ status: "loading", image: null, pageCount: rendered.pageCount, issue: null });
      return true;
    } catch (error) {
      if (activeContextKey.current === expectedContextKey) {
        setState({ status: "error", image: null, pageCount: null, issue: error instanceof Error ? error.message : "geometry_underlay_import_failed" });
      }
      return false;
    }
  }, [commitOperations, levelId, onAttachmentsImported, projectSessionId, revisionId, state.status, underlay]);

  const selectPdfPage = useCallback(async (pageNumber: number): Promise<boolean> => {
    if (!projectSessionId || !revisionId || !levelId || underlay?.mime_type !== "application/pdf") return false;
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || (state.pageCount !== null && pageNumber > state.pageCount)) return false;
    const expectedContextKey = activeContextKey.current;
    setState((current) => ({ ...current, status: "loading", issue: null }));
    try {
      const rendered = await loadRenderedResource(projectSessionId, revisionId, underlay, pageNumber);
      if (activeContextKey.current !== expectedContextKey) {
        rendered.release();
        return false;
      }
      const updated: GeometryPlanUnderlay = {
        ...underlay,
        page_number: pageNumber,
        pixel_width: rendered.width,
        pixel_height: rendered.height,
        pixel_origin_x_milli: 0,
        pixel_origin_y_milli: rendered.height * 1_000,
      };
      if (!commitOperations([{
        operation: "update_plan_underlay",
        parameters: { level_id: levelId, underlay: updated },
      }])) {
        rendered.release();
        setState((current) => ({ ...current, status: "error", issue: "geometry_underlay_commit_failed" }));
        return false;
      }
      rendered.release();
      setState({ status: "loading", image: null, pageCount: rendered.pageCount, issue: null });
      return true;
    } catch (error) {
      if (activeContextKey.current === expectedContextKey) {
        setState((current) => ({ ...current, status: "error", issue: error instanceof Error ? error.message : "geometry_underlay_pdf_render_failed" }));
      }
      return false;
    }
  }, [commitOperations, levelId, projectSessionId, revisionId, state.pageCount, underlay]);

  return { ...state, importUnderlay, selectPdfPage };
}
