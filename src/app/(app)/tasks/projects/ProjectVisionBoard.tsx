"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { Expand, GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmForm } from "@/components/ui/confirm-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addVisionPin,
  createVisionPinLink,
  deleteVisionPin,
  deleteVisionPinLink,
  moveVisionPin,
  resizeVisionPin,
} from "@/modules/tasks/actions";
import {
  clampPct,
  clampPinSizePct,
  normalizePinLinkIds,
  VISION_PIN_H_DEFAULT,
  VISION_PIN_SIZE_MIN,
  VISION_PIN_W_DEFAULT,
} from "@/domain/tasks/projectConstants";
import { cn } from "@/lib/utils";

export type VisionPin = {
  id: string;
  kind: string;
  body: string | null;
  imageUrl: string | null;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  zIndex: number;
};

export type VisionPinLink = {
  id: string;
  fromPinId: string;
  toPinId: string;
};

type ResizeCorner = "nw" | "ne" | "sw" | "se";
type ConnectPort = "n" | "e" | "s" | "w";

type ConnectDraft = {
  fromPinId: string;
  x1Pct: number;
  y1Pct: number;
  x2Pct: number;
  y2Pct: number;
  hoverPinId: string | null;
};

function pinWithDefaults(pin: VisionPin): VisionPin {
  return {
    ...pin,
    wPct: pin.wPct ?? VISION_PIN_W_DEFAULT,
    hPct: pin.hPct ?? VISION_PIN_H_DEFAULT,
  };
}

function applyResizeCorner(
  pin: VisionPin,
  corner: ResizeCorner,
  pointerXPct: number,
  pointerYPct: number,
): Pick<VisionPin, "xPct" | "yPct" | "wPct" | "hPct"> {
  const halfW = pin.wPct / 2;
  const halfH = pin.hPct / 2;
  const left = pin.xPct - halfW;
  const right = pin.xPct + halfW;
  const top = pin.yPct - halfH;
  const bottom = pin.yPct + halfH;

  const fixedLeft = left;
  const fixedRight = right;
  const fixedTop = top;
  const fixedBottom = bottom;

  if (corner === "se") {
    const movingX = Math.max(fixedLeft + VISION_PIN_SIZE_MIN, Math.min(100, pointerXPct));
    const movingY = Math.max(fixedTop + VISION_PIN_SIZE_MIN, Math.min(100, pointerYPct));
    const wPct = clampPinSizePct(movingX - fixedLeft);
    const hPct = clampPinSizePct(movingY - fixedTop);
    return {
      xPct: clampPct(fixedLeft + wPct / 2),
      yPct: clampPct(fixedTop + hPct / 2),
      wPct,
      hPct,
    };
  }
  if (corner === "sw") {
    const movingX = Math.min(fixedRight - VISION_PIN_SIZE_MIN, Math.max(0, pointerXPct));
    const movingY = Math.max(fixedTop + VISION_PIN_SIZE_MIN, Math.min(100, pointerYPct));
    const wPct = clampPinSizePct(fixedRight - movingX);
    const hPct = clampPinSizePct(movingY - fixedTop);
    return {
      xPct: clampPct(fixedRight - wPct / 2),
      yPct: clampPct(fixedTop + hPct / 2),
      wPct,
      hPct,
    };
  }
  if (corner === "ne") {
    const movingX = Math.max(fixedLeft + VISION_PIN_SIZE_MIN, Math.min(100, pointerXPct));
    const movingY = Math.min(fixedBottom - VISION_PIN_SIZE_MIN, Math.max(0, pointerYPct));
    const wPct = clampPinSizePct(movingX - fixedLeft);
    const hPct = clampPinSizePct(fixedBottom - movingY);
    return {
      xPct: clampPct(fixedLeft + wPct / 2),
      yPct: clampPct(fixedBottom - hPct / 2),
      wPct,
      hPct,
    };
  }
  const movingX = Math.min(fixedRight - VISION_PIN_SIZE_MIN, Math.max(0, pointerXPct));
  const movingY = Math.min(fixedBottom - VISION_PIN_SIZE_MIN, Math.max(0, pointerYPct));
  const wPct = clampPinSizePct(fixedRight - movingX);
  const hPct = clampPinSizePct(fixedBottom - movingY);
  return {
    xPct: clampPct(fixedRight - wPct / 2),
    yPct: clampPct(fixedBottom - hPct / 2),
    wPct,
    hPct,
  };
}

function portCenterPct(pin: VisionPin, port: ConnectPort): { xPct: number; yPct: number } {
  const halfW = pin.wPct / 2;
  const halfH = pin.hPct / 2;
  if (port === "n") return { xPct: pin.xPct, yPct: pin.yPct - halfH };
  if (port === "s") return { xPct: pin.xPct, yPct: pin.yPct + halfH };
  if (port === "w") return { xPct: pin.xPct - halfW, yPct: pin.yPct };
  return { xPct: pin.xPct + halfW, yPct: pin.yPct };
}

function clientToBoardPct(
  board: HTMLElement,
  clientX: number,
  clientY: number,
): { xPct: number; yPct: number } | null {
  const rect = board.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    xPct: ((clientX - rect.left) / rect.width) * 100,
    yPct: ((clientY - rect.top) / rect.height) * 100,
  };
}

function pinIdFromPoint(
  board: HTMLElement,
  clientX: number,
  clientY: number,
  excludePinId: string,
): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    if (!board.contains(el)) continue;
    const host = el.closest("[data-vision-pin-id]");
    if (!(host instanceof HTMLElement)) continue;
    const id = host.dataset.visionPinId;
    if (!id || id === excludePinId) continue;
    return id;
  }
  return null;
}

function VisionPinCard({
  pin,
  dropHighlight,
  connectingFromThis,
  onOpen,
  onConnectStart,
  onResizeLive,
  onResizeEnd,
}: {
  pin: VisionPin;
  dropHighlight: boolean;
  connectingFromThis: boolean;
  onOpen: (pin: VisionPin) => void;
  onConnectStart: (
    pin: VisionPin,
    port: ConnectPort,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onResizeLive: (
    pinId: string,
    next: Pick<VisionPin, "xPct" | "yPct" | "wPct" | "hPct">,
  ) => void;
  onResizeEnd: (
    pinId: string,
    next: Pick<VisionPin, "xPct" | "yPct" | "wPct" | "hPct">,
  ) => void;
}) {
  const t = useTranslations("tasks");
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: pin.id,
  });
  const style = {
    left: `${pin.xPct}%`,
    top: `${pin.yPct}%`,
    width: `${pin.wPct}%`,
    height: `${pin.hPct}%`,
    zIndex: Math.max(25, pin.zIndex + 1),
    transform: transform
      ? `translate(-50%, -50%) translate3d(${transform.x}px, ${transform.y}px, 0)`
      : "translate(-50%, -50%)",
  };

  function onCornerPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: ResizeCorner,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const board = event.currentTarget.closest("[data-vision-board]") as HTMLElement | null;
    if (!board) return;

    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);
    let latest = {
      xPct: pin.xPct,
      yPct: pin.yPct,
      wPct: pin.wPct,
      hPct: pin.hPct,
    };

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const pct = clientToBoardPct(board!, ev.clientX, ev.clientY);
      if (!pct) return;
      latest = applyResizeCorner(pin, corner, pct.xPct, pct.yPct);
      onResizeLive(pin.id, latest);
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      onResizeEnd(pin.id, latest);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const corners: { corner: ResizeCorner; className: string; label: string }[] = [
    { corner: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize", label: t("visionResizeNw") },
    { corner: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize", label: t("visionResizeNe") },
    { corner: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize", label: t("visionResizeSw") },
    { corner: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize", label: t("visionResizeSe") },
  ];

  const ports: { port: ConnectPort; className: string }[] = [
    { port: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-crosshair" },
    { port: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-crosshair" },
    { port: "s", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-crosshair" },
    { port: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-crosshair" },
  ];

  return (
    <div
      ref={setNodeRef}
      data-vision-pin-id={pin.id}
      style={style}
      className={cn(
        "group absolute flex flex-col overflow-visible rounded-md border bg-white text-xs shadow-md dark:bg-zinc-950",
        dropHighlight
          ? "border-emerald-500 ring-2 ring-emerald-400/60"
          : "border-zinc-200 dark:border-zinc-700",
      )}
    >
      <div
        className="mb-1 flex shrink-0 cursor-grab items-center gap-1 px-2 pt-2 text-[10px] text-zinc-400 active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t("dragHandle")}</span>
      </div>
      <button
        type="button"
        className="min-h-0 flex-1 overflow-hidden px-2 pb-2 text-left"
        onClick={() => {
          if (pin.kind === "image" && pin.imageUrl) onOpen(pin);
        }}
      >
        {pin.kind === "image" && pin.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pin.imageUrl}
            alt=""
            className="mb-1 h-full max-h-full w-full rounded object-cover pointer-events-none"
            draggable={false}
          />
        ) : null}
        {pin.body ? (
          <p className="whitespace-pre-wrap break-words">{pin.body}</p>
        ) : null}
      </button>
      {corners.map(({ corner, className, label }) => (
        <button
          key={corner}
          type="button"
          aria-label={label}
          className={cn(
            "absolute z-10 h-3.5 w-3.5 rounded-sm border border-emerald-600 bg-white opacity-70 shadow hover:opacity-100 focus:opacity-100 dark:bg-zinc-900 md:opacity-0 md:group-hover:opacity-100",
            className,
          )}
          onPointerDown={(e) => onCornerPointerDown(e, corner)}
        />
      ))}
      {ports.map(({ port, className }) => (
        <button
          key={port}
          type="button"
          aria-label={t("visionConnectPort")}
          tabIndex={-1}
          className={cn(
            "absolute z-30 h-3.5 w-3.5 touch-none rounded-full border-2 border-emerald-600 bg-white shadow dark:bg-zinc-900",
            connectingFromThis
              ? "opacity-100"
              : "opacity-70 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
            className,
          )}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onConnectStart(pin, port, e);
          }}
        />
      ))}
    </div>
  );
}

function VisionAddForms({
  projectId,
  textFormRef,
  imageFormRef,
  onAdd,
  compact,
}: {
  projectId: string;
  textFormRef: RefObject<HTMLFormElement | null>;
  imageFormRef: RefObject<HTMLFormElement | null>;
  onAdd: (formData: FormData) => Promise<void>;
  compact?: boolean;
}) {
  const t = useTranslations("tasks");
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <form
        ref={textFormRef}
        action={onAdd}
        className={cn(
          "space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800",
          compact && "p-2",
        )}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="kind" value="text" />
        <input type="hidden" name="xPct" value="12" />
        <input type="hidden" name="yPct" value="12" />
        <Textarea
          name="body"
          placeholder={t("visionTextPlaceholder")}
          required
          rows={compact ? 2 : 3}
        />
        <Button type="submit" size="sm">
          {t("addTextPin")}
        </Button>
      </form>
      <form
        ref={imageFormRef}
        action={onAdd}
        className={cn(
          "space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800",
          compact && "p-2",
        )}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="kind" value="image" />
        <input type="hidden" name="xPct" value="40" />
        <input type="hidden" name="yPct" value="20" />
        <Input name="image" type="file" accept="image/*" required />
        <Input name="body" placeholder={t("visionCaptionOptional")} />
        <Button type="submit" size="sm">
          {t("addImagePin")}
        </Button>
      </form>
    </div>
  );
}

function VisionPinList({
  pins,
  onDelete,
  className,
}: {
  pins: VisionPin[];
  onDelete: (formData: FormData) => Promise<void>;
  className?: string;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  if (pins.length === 0) return null;
  return (
    <ul className={cn("space-y-2", className)}>
      {pins.map((pin) => (
        <li key={pin.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">
            {pin.kind === "text" ? pin.body : pin.body || t("imagePin")}
          </span>
          <ConfirmForm action={onDelete} message={t("confirmDeletePin")}>
            <input type="hidden" name="id" value={pin.id} />
            <Button type="submit" size="sm" variant="destructive">
              {tc("delete")}
            </Button>
          </ConfirmForm>
        </li>
      ))}
    </ul>
  );
}

function VisionLinkLayer({
  pins,
  links,
  dragOffset,
  connectDraft,
  onDeleteLink,
  mode,
  hitEnabled,
}: {
  pins: VisionPin[];
  links: VisionPinLink[];
  dragOffset: { pinId: string; dxPct: number; dyPct: number } | null;
  connectDraft: ConnectDraft | null;
  onDeleteLink: (linkId: string) => void;
  mode: "paint" | "hit";
  hitEnabled: boolean;
}) {
  const t = useTranslations("tasks");
  const byId = new Map(pins.map((p) => [p.id, p]));

  function centerOf(pinId: string): { x: number; y: number } | null {
    const pin = byId.get(pinId);
    if (!pin) return null;
    let x = pin.xPct;
    let y = pin.yPct;
    if (dragOffset?.pinId === pinId) {
      x += dragOffset.dxPct;
      y += dragOffset.dyPct;
    }
    return { x, y };
  }

  return (
    <svg
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        mode === "paint" ? "z-0" : "z-20",
      )}
      aria-hidden={mode === "paint" || links.length === 0}
    >
      {links.map((link) => {
        const a = centerOf(link.fromPinId);
        const b = centerOf(link.toPinId);
        if (!a || !b) return null;
        if (mode === "paint") {
          return (
            <line
              key={link.id}
              x1={`${a.x}%`}
              y1={`${a.y}%`}
              x2={`${b.x}%`}
              y2={`${b.y}%`}
              className="stroke-emerald-600/70 dark:stroke-emerald-400/70"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        return (
          <line
            key={link.id}
            x1={`${a.x}%`}
            y1={`${a.y}%`}
            x2={`${b.x}%`}
            y2={`${b.y}%`}
            stroke="transparent"
            strokeWidth={14}
            vectorEffect="non-scaling-stroke"
            className={hitEnabled ? "cursor-pointer" : undefined}
            style={{ pointerEvents: hitEnabled ? "stroke" : "none" }}
            role="button"
            tabIndex={hitEnabled ? 0 : -1}
            aria-label={t("visionLinkAria")}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteLink(link.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onDeleteLink(link.id);
              }
            }}
          />
        );
      })}
      {mode === "paint" && connectDraft ? (
        <line
          x1={`${connectDraft.x1Pct}%`}
          y1={`${connectDraft.y1Pct}%`}
          x2={`${connectDraft.x2Pct}%`}
          y2={`${connectDraft.y2Pct}%`}
          className="stroke-emerald-500"
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

function VisionBoardSurface({
  boardRef,
  pins,
  links,
  dragOffset,
  connectDraft,
  onOpen,
  onConnectStart,
  onDeleteLink,
  onResizeLive,
  onResizeEnd,
  className,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  pins: VisionPin[];
  links: VisionPinLink[];
  dragOffset: { pinId: string; dxPct: number; dyPct: number } | null;
  connectDraft: ConnectDraft | null;
  onOpen: (pin: VisionPin) => void;
  onConnectStart: (
    pin: VisionPin,
    port: ConnectPort,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onDeleteLink: (linkId: string) => void;
  onResizeLive: (
    pinId: string,
    next: Pick<VisionPin, "xPct" | "yPct" | "wPct" | "hPct">,
  ) => void;
  onResizeEnd: (
    pinId: string,
    next: Pick<VisionPin, "xPct" | "yPct" | "wPct" | "hPct">,
  ) => void;
  className?: string;
}) {
  const t = useTranslations("tasks");
  const hitEnabled = !connectDraft;
  return (
    <div
      ref={boardRef}
      data-vision-board
      className={cn(
        "relative overflow-hidden border border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 to-zinc-100 dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-950",
        className,
      )}
    >
      {pins.length === 0 && (
        <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-500">
          {t("emptyVision")}
        </p>
      )}
      <VisionLinkLayer
        pins={pins}
        links={links}
        dragOffset={dragOffset}
        connectDraft={connectDraft}
        onDeleteLink={onDeleteLink}
        mode="paint"
        hitEnabled={hitEnabled}
      />
      {pins.map((pin) => (
        <VisionPinCard
          key={pin.id}
          pin={pin}
          dropHighlight={connectDraft?.hoverPinId === pin.id}
          connectingFromThis={connectDraft?.fromPinId === pin.id}
          onOpen={onOpen}
          onConnectStart={onConnectStart}
          onResizeLive={onResizeLive}
          onResizeEnd={onResizeEnd}
        />
      ))}
      <VisionLinkLayer
        pins={pins}
        links={links}
        dragOffset={dragOffset}
        connectDraft={null}
        onDeleteLink={onDeleteLink}
        mode="hit"
        hitEnabled={hitEnabled}
      />
    </div>
  );
}

export function ProjectVisionBoard({
  projectId,
  initialPins,
  initialLinks,
}: {
  projectId: string;
  initialPins: VisionPin[];
  initialLinks: VisionPinLink[];
}) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const textFormRef = useRef<HTMLFormElement>(null);
  const imageFormRef = useRef<HTMLFormElement>(null);
  const enterButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lightboxOpenRef = useRef(false);
  const connectDraftRef = useRef<ConnectDraft | null>(null);
  const connectGestureCleanupRef = useRef<(() => void) | null>(null);
  const [pins, setPins] = useState(() => initialPins.map(pinWithDefaults));
  const [links, setLinks] = useState(initialLinks);
  const [connectDraft, setConnectDraft] = useState<ConnectDraft | null>(null);
  const [dragOffset, setDragOffset] = useState<{
    pinId: string;
    dxPct: number;
    dyPct: number;
  } | null>(null);
  const [lightbox, setLightboxState] = useState<VisionPin | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, startTransition] = useTransition();

  function setLightbox(pin: VisionPin | null) {
    lightboxOpenRef.current = pin !== null;
    setLightboxState(pin);
  }

  function clearConnectDraft() {
    connectDraftRef.current = null;
    setConnectDraft(null);
  }

  function cancelConnectGesture() {
    connectGestureCleanupRef.current?.();
    connectGestureCleanupRef.current = null;
    clearConnectDraft();
  }

  useEffect(() => {
    setPins(initialPins.map(pinWithDefaults));
  }, [initialPins]);

  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  useEffect(() => {
    if (!isFullscreen) return;

    const main = document.querySelector("main");
    const prevOverflow = main instanceof HTMLElement ? main.style.overflow : "";
    if (main instanceof HTMLElement) {
      main.style.overflow = "hidden";
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (lightboxOpenRef.current) return;
      event.preventDefault();
      if (connectDraftRef.current) {
        cancelConnectGesture();
        return;
      }
      setIsFullscreen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (main instanceof HTMLElement) {
        main.style.overflow = prevOverflow;
      }
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      } else {
        enterButtonRef.current?.focus();
      }
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (isFullscreen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!connectDraftRef.current) return;
      event.preventDefault();
      cancelConnectGesture();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function exitFullscreen() {
    setLightbox(null);
    cancelConnectGesture();
    setIsFullscreen(false);
  }

  function pctFromDelta(delta: { x: number; y: number }) {
    const board = boardRef.current;
    if (!board) return { dxPct: 0, dyPct: 0 };
    const rect = board.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { dxPct: 0, dyPct: 0 };
    return {
      dxPct: (delta.x / rect.width) * 100,
      dyPct: (delta.y / rect.height) * 100,
    };
  }

  function onDragStart(event: DragStartEvent) {
    setDragOffset({ pinId: String(event.active.id), dxPct: 0, dyPct: 0 });
  }

  function onDragMove(event: DragMoveEvent) {
    const { dxPct, dyPct } = pctFromDelta(event.delta);
    setDragOffset({ pinId: String(event.active.id), dxPct, dyPct });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, delta } = event;
    setDragOffset(null);
    const board = boardRef.current;
    if (!board) return;
    const pinId = String(active.id);
    const pin = pins.find((p) => p.id === pinId);
    if (!pin) return;

    const rect = board.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dxPct = (delta.x / rect.width) * 100;
    const dyPct = (delta.y / rect.height) * 100;
    const xPct = Math.min(100, Math.max(0, pin.xPct + dxPct));
    const yPct = Math.min(100, Math.max(0, pin.yPct + dyPct));

    setPins((prev) =>
      prev.map((row) => (row.id === pinId ? { ...row, xPct, yPct } : row)),
    );
    startTransition(async () => {
      await moveVisionPin({ pinId, xPct, yPct });
      router.refresh();
    });
  }

  function onResizeLive(
    pinId: string,
    next: Pick<VisionPin, "xPct" | "yPct" | "wPct" | "hPct">,
  ) {
    setPins((prev) =>
      prev.map((row) => (row.id === pinId ? { ...row, ...next } : row)),
    );
  }

  function onResizeEnd(
    pinId: string,
    next: Pick<VisionPin, "xPct" | "yPct" | "wPct" | "hPct">,
  ) {
    const previous = pins.find((p) => p.id === pinId);
    setPins((prev) =>
      prev.map((row) => (row.id === pinId ? { ...row, ...next } : row)),
    );
    startTransition(async () => {
      try {
        await resizeVisionPin({ pinId, ...next });
        router.refresh();
      } catch {
        if (previous) {
          setPins((prev) =>
            prev.map((row) =>
              row.id === pinId
                ? {
                    ...row,
                    xPct: previous.xPct,
                    yPct: previous.yPct,
                    wPct: previous.wPct,
                    hPct: previous.hPct,
                  }
                : row,
            ),
          );
        }
      }
    });
  }

  async function persistLink(fromPinId: string, toPinId: string) {
    const [a, b] = normalizePinLinkIds(fromPinId, toPinId);
    const already = links.some((l) => l.fromPinId === a && l.toPinId === b);
    if (already) return;

    const tempId = `temp-${a}-${b}`;
    setLinks((prev) => [...prev, { id: tempId, fromPinId: a, toPinId: b }]);
    try {
      const created = await createVisionPinLink({
        pinAId: fromPinId,
        pinBId: toPinId,
      });
      setLinks((prev) => {
        const withoutTemp = prev.filter((l) => l.id !== tempId);
        if (
          withoutTemp.some(
            (l) =>
              l.fromPinId === created.fromPinId && l.toPinId === created.toPinId,
          )
        ) {
          return withoutTemp;
        }
        return [
          ...withoutTemp,
          {
            id: created.id,
            fromPinId: created.fromPinId,
            toPinId: created.toPinId,
          },
        ];
      });
      router.refresh();
    } catch {
      setLinks((prev) => prev.filter((l) => l.id !== tempId));
    }
  }

  function onConnectStart(
    pin: VisionPin,
    port: ConnectPort,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0) return;
    const board = boardRef.current;
    if (!board) return;
    const origin = portCenterPct(pin, port);
    const pointerId = event.pointerId;
    const target = event.currentTarget;

    // Replace any prior unfinished gesture, then capture this pointer.
    cancelConnectGesture();
    target.setPointerCapture(pointerId);

    const initial: ConnectDraft = {
      fromPinId: pin.id,
      x1Pct: origin.xPct,
      y1Pct: origin.yPct,
      x2Pct: origin.xPct,
      y2Pct: origin.yPct,
      hoverPinId: null,
    };
    connectDraftRef.current = initial;
    setConnectDraft(initial);

    function updateFromEvent(ev: PointerEvent) {
      const pct = clientToBoardPct(board!, ev.clientX, ev.clientY);
      if (!pct) return;
      const hoverPinId = pinIdFromPoint(board!, ev.clientX, ev.clientY, pin.id);
      const next: ConnectDraft = {
        fromPinId: pin.id,
        x1Pct: origin.xPct,
        y1Pct: origin.yPct,
        x2Pct: pct.xPct,
        y2Pct: pct.yPct,
        hoverPinId,
      };
      connectDraftRef.current = next;
      setConnectDraft(next);
    }

    function cleanupListeners() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
      connectGestureCleanupRef.current = null;
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      updateFromEvent(ev);
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanupListeners();
      const targetId = pinIdFromPoint(board!, ev.clientX, ev.clientY, pin.id);
      clearConnectDraft();
      if (!targetId || targetId === pin.id) return;
      void persistLink(pin.id, targetId);
    }

    function onCancel(ev?: Event) {
      if (ev instanceof PointerEvent && ev.pointerId !== pointerId) return;
      cleanupListeners();
      clearConnectDraft();
    }

    connectGestureCleanupRef.current = () => {
      cleanupListeners();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
  }

  function handleDeleteLink(linkId: string) {
    if (linkId.startsWith("temp-")) return;
    if (!window.confirm(t("confirmDeleteLink"))) return;
    const prev = links;
    setLinks((rows) => rows.filter((l) => l.id !== linkId));
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", linkId);
        await deleteVisionPinLink(fd);
        router.refresh();
      } catch {
        setLinks(prev);
      }
    });
  }

  async function handleAdd(formData: FormData) {
    const created = await addVisionPin(formData);
    setPins((prev) => [...prev, pinWithDefaults(created)]);
    const kind = formData.get("kind");
    if (kind === "text") textFormRef.current?.reset();
    if (kind === "image") imageFormRef.current?.reset();
    router.refresh();
  }

  async function handleDelete(formData: FormData) {
    const id = formData.get("id") as string;
    await deleteVisionPin(formData);
    setPins((prev) => prev.filter((pin) => pin.id !== id));
    setLinks((prev) =>
      prev.filter((l) => l.fromPinId !== id && l.toPinId !== id),
    );
    if (connectDraftRef.current?.fromPinId === id) cancelConnectGesture();
    if (lightbox?.id === id) setLightbox(null);
    router.refresh();
  }

  const board = (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragOffset(null)}
    >
      <VisionBoardSurface
        boardRef={boardRef}
        pins={pins}
        links={links}
        dragOffset={dragOffset}
        connectDraft={connectDraft}
        onOpen={setLightbox}
        onConnectStart={onConnectStart}
        onDeleteLink={handleDeleteLink}
        onResizeLive={onResizeLive}
        onResizeEnd={onResizeEnd}
        className={
          isFullscreen
            ? "h-full min-h-0 flex-1 rounded-lg"
            : "h-[28rem] rounded-xl"
        }
      />
    </DndContext>
  );

  const lightboxDialog = (
    <Dialog
      open={Boolean(lightbox)}
      onOpenChange={(open) => {
        if (!open) setLightbox(null);
      }}
    >
      <DialogContent>
        {lightbox && (
          <>
            <DialogHeader>
              <DialogTitle>{lightbox.body || t("imagePin")}</DialogTitle>
              <DialogDescription>{t("preview")}</DialogDescription>
            </DialogHeader>
            {lightbox.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightbox.imageUrl}
                alt=""
                className="max-h-[60vh] w-full object-contain"
              />
            ) : null}
            {lightbox.imageUrl ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={lightbox.imageUrl} target="_blank" rel="noreferrer">
                    {t("openInNewTab")}
                  </a>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <a href={`${lightbox.imageUrl}?download=1`}>{t("download")}</a>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  if (isFullscreen) {
    return (
      <>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("sectionVision")}
          className="fixed inset-0 z-50 flex h-dvh flex-col bg-white dark:bg-zinc-950"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <h2 className="text-base font-semibold">{t("sectionVision")}</h2>
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="sm"
              onClick={exitFullscreen}
            >
              <X className="mr-1 h-4 w-4" aria-hidden />
              {t("visionExitFullscreen")}
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
            <div className="flex max-h-[40vh] shrink-0 flex-col gap-3 overflow-auto md:max-h-none md:w-72 md:overflow-y-auto">
              <VisionAddForms
                projectId={projectId}
                textFormRef={textFormRef}
                imageFormRef={imageFormRef}
                onAdd={handleAdd}
                compact
              />
              <VisionPinList pins={pins} onDelete={handleDelete} />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{board}</div>
          </div>
        </div>
        {lightboxDialog}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          ref={enterButtonRef}
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsFullscreen(true)}
        >
          <Expand className="mr-1 h-4 w-4" aria-hidden />
          {t("visionEnterFullscreen")}
        </Button>
      </div>
      <VisionAddForms
        projectId={projectId}
        textFormRef={textFormRef}
        imageFormRef={imageFormRef}
        onAdd={handleAdd}
      />
      {board}
      <VisionPinList pins={pins} onDelete={handleDelete} />
      {lightboxDialog}
    </div>
  );
}
