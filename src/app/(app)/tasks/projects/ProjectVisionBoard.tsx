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
import { Expand, GripVertical, Link2, X } from "lucide-react";
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

  let fixedLeft = left;
  let fixedRight = right;
  let fixedTop = top;
  let fixedBottom = bottom;
  let movingX = pointerXPct;
  let movingY = pointerYPct;

  if (corner === "se") {
    movingX = Math.max(fixedLeft + VISION_PIN_SIZE_MIN, Math.min(100, pointerXPct));
    movingY = Math.max(fixedTop + VISION_PIN_SIZE_MIN, Math.min(100, pointerYPct));
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
    movingX = Math.min(fixedRight - VISION_PIN_SIZE_MIN, Math.max(0, pointerXPct));
    movingY = Math.max(fixedTop + VISION_PIN_SIZE_MIN, Math.min(100, pointerYPct));
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
    movingX = Math.max(fixedLeft + VISION_PIN_SIZE_MIN, Math.min(100, pointerXPct));
    movingY = Math.min(fixedBottom - VISION_PIN_SIZE_MIN, Math.max(0, pointerYPct));
    const wPct = clampPinSizePct(movingX - fixedLeft);
    const hPct = clampPinSizePct(fixedBottom - movingY);
    return {
      xPct: clampPct(fixedLeft + wPct / 2),
      yPct: clampPct(fixedBottom - hPct / 2),
      wPct,
      hPct,
    };
  }
  // nw
  movingX = Math.min(fixedRight - VISION_PIN_SIZE_MIN, Math.max(0, pointerXPct));
  movingY = Math.min(fixedBottom - VISION_PIN_SIZE_MIN, Math.max(0, pointerYPct));
  {
    const wPct = clampPinSizePct(fixedRight - movingX);
    const hPct = clampPinSizePct(fixedBottom - movingY);
    return {
      xPct: clampPct(fixedRight - wPct / 2),
      yPct: clampPct(fixedBottom - hPct / 2),
      wPct,
      hPct,
    };
  }
}

function VisionPinCard({
  pin,
  linkMode,
  linkSelected,
  onOpen,
  onSelectForLink,
  onResizeLive,
  onResizeEnd,
}: {
  pin: VisionPin;
  linkMode: boolean;
  linkSelected: boolean;
  onOpen: (pin: VisionPin) => void;
  onSelectForLink: (pin: VisionPin) => void;
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
    disabled: linkMode,
  });
  const style = {
    left: `${pin.xPct}%`,
    top: `${pin.yPct}%`,
    width: `${pin.wPct}%`,
    height: `${pin.hPct}%`,
    zIndex: Math.max(1, pin.zIndex + 1),
    transform: transform
      ? `translate(-50%, -50%) translate3d(${transform.x}px, ${transform.y}px, 0)`
      : "translate(-50%, -50%)",
  };

  function handleBodyClick() {
    if (linkMode) {
      onSelectForLink(pin);
      return;
    }
    if (pin.kind === "image" && pin.imageUrl) onOpen(pin);
  }

  function onCornerPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: ResizeCorner,
  ) {
    if (linkMode) return;
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
      const rect = board!.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const xPct = ((ev.clientX - rect.left) / rect.width) * 100;
      const yPct = ((ev.clientY - rect.top) / rect.height) * 100;
      latest = applyResizeCorner(pin, corner, xPct, yPct);
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group absolute flex flex-col overflow-visible rounded-md border bg-white text-xs shadow-md dark:bg-zinc-950",
        linkSelected
          ? "border-emerald-500 ring-2 ring-emerald-400/60"
          : "border-zinc-200 dark:border-zinc-700",
        linkMode && "cursor-pointer",
      )}
    >
      <div
        className={cn(
          "mb-1 flex shrink-0 items-center gap-1 px-2 pt-2 text-[10px] text-zinc-400",
          !linkMode && "cursor-grab active:cursor-grabbing",
        )}
        {...(linkMode ? {} : listeners)}
        {...(linkMode ? {} : attributes)}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t("dragHandle")}</span>
      </div>
      <button
        type="button"
        className="min-h-0 flex-1 overflow-hidden px-2 pb-2 text-left"
        onClick={handleBodyClick}
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
      {!linkMode &&
        corners.map(({ corner, className, label }) => (
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
  onDeleteLink,
  mode,
}: {
  pins: VisionPin[];
  links: VisionPinLink[];
  dragOffset: { pinId: string; dxPct: number; dyPct: number } | null;
  onDeleteLink: (linkId: string) => void;
  mode: "paint" | "hit";
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
            className="cursor-pointer"
            style={{ pointerEvents: "stroke" }}
            role="button"
            tabIndex={0}
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
    </svg>
  );
}

function VisionBoardSurface({
  boardRef,
  pins,
  links,
  linkMode,
  linkFromId,
  dragOffset,
  onOpen,
  onSelectForLink,
  onDeleteLink,
  onResizeLive,
  onResizeEnd,
  className,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  pins: VisionPin[];
  links: VisionPinLink[];
  linkMode: boolean;
  linkFromId: string | null;
  dragOffset: { pinId: string; dxPct: number; dyPct: number } | null;
  onOpen: (pin: VisionPin) => void;
  onSelectForLink: (pin: VisionPin) => void;
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
        onDeleteLink={onDeleteLink}
        mode="paint"
      />
      {pins.map((pin) => (
        <VisionPinCard
          key={pin.id}
          pin={pin}
          linkMode={linkMode}
          linkSelected={linkFromId === pin.id}
          onOpen={onOpen}
          onSelectForLink={onSelectForLink}
          onResizeLive={onResizeLive}
          onResizeEnd={onResizeEnd}
        />
      ))}
      <VisionLinkLayer
        pins={pins}
        links={links}
        dragOffset={dragOffset}
        onDeleteLink={onDeleteLink}
        mode="hit"
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
  const [pins, setPins] = useState(() => initialPins.map(pinWithDefaults));
  const [links, setLinks] = useState(initialLinks);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
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
      if (linkMode) {
        setLinkMode(false);
        setLinkFromId(null);
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
  }, [isFullscreen, linkMode]);

  useEffect(() => {
    if (isFullscreen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!linkMode) return;
      event.preventDefault();
      setLinkMode(false);
      setLinkFromId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, linkMode]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function exitFullscreen() {
    setLightbox(null);
    setIsFullscreen(false);
  }

  function toggleLinkMode() {
    setLinkMode((prev) => {
      if (prev) setLinkFromId(null);
      return !prev;
    });
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

  async function handleSelectForLink(pin: VisionPin) {
    if (!linkFromId) {
      setLinkFromId(pin.id);
      return;
    }
    if (linkFromId === pin.id) {
      setLinkFromId(null);
      return;
    }
    const [fromPinId, toPinId] = normalizePinLinkIds(linkFromId, pin.id);
    const already = links.some(
      (l) => l.fromPinId === fromPinId && l.toPinId === toPinId,
    );
    setLinkFromId(null);
    if (already) return;

    const tempId = `temp-${fromPinId}-${toPinId}`;
    setLinks((prev) => [...prev, { id: tempId, fromPinId, toPinId }]);
    try {
      const created = await createVisionPinLink({
        pinAId: linkFromId,
        pinBId: pin.id,
      });
      setLinks((prev) =>
        prev.map((l) =>
          l.id === tempId
            ? {
                id: created.id,
                fromPinId: created.fromPinId,
                toPinId: created.toPinId,
              }
            : l,
        ),
      );
      router.refresh();
    } catch {
      setLinks((prev) => prev.filter((l) => l.id !== tempId));
    }
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
    if (linkFromId === id) setLinkFromId(null);
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
        linkMode={linkMode}
        linkFromId={linkFromId}
        dragOffset={dragOffset}
        onOpen={setLightbox}
        onSelectForLink={handleSelectForLink}
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

  const linkModeButton = (
    <Button
      type="button"
      size="sm"
      variant={linkMode ? "default" : "outline"}
      onClick={toggleLinkMode}
      aria-pressed={linkMode}
    >
      <Link2 className="mr-1 h-4 w-4" aria-hidden />
      {linkMode ? t("visionLinkModeOn") : t("visionLinkMode")}
    </Button>
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
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-base font-semibold">{t("sectionVision")}</h2>
              {linkMode ? (
                <p className="text-xs text-zinc-500">{t("visionLinkHint")}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {linkModeButton}
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
        {linkModeButton}
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
      {linkMode ? (
        <p className="text-xs text-zinc-500">{t("visionLinkHint")}</p>
      ) : null}
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
