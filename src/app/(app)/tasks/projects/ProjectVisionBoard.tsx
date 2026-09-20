"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { GripVertical } from "lucide-react";
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
  deleteVisionPin,
  moveVisionPin,
} from "@/modules/tasks/actions";

export type VisionPin = {
  id: string;
  kind: string;
  body: string | null;
  imageUrl: string | null;
  xPct: number;
  yPct: number;
  zIndex: number;
};

function VisionPinCard({
  pin,
  onOpen,
}: {
  pin: VisionPin;
  onOpen: (pin: VisionPin) => void;
}) {
  const t = useTranslations("tasks");
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: pin.id,
  });
  const style = {
    left: `${pin.xPct}%`,
    top: `${pin.yPct}%`,
    zIndex: pin.zIndex,
    transform: transform
      ? `translate(-50%, -50%) translate3d(${transform.x}px, ${transform.y}px, 0)`
      : "translate(-50%, -50%)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="absolute w-40 cursor-grab rounded-md border border-zinc-200 bg-white p-2 text-xs shadow-md active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-950"
      {...listeners}
      {...attributes}
    >
      <div className="mb-1 flex items-center gap-1 text-[10px] text-zinc-400">
        <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t("dragHandle")}</span>
      </div>
      {pin.kind === "image" && pin.imageUrl ? (
        <button
          type="button"
          className="block w-full cursor-grab text-left active:cursor-grabbing"
          onClick={() => onOpen(pin)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pin.imageUrl}
            alt=""
            className="mb-1 max-h-28 w-full rounded object-cover pointer-events-none"
            draggable={false}
          />
        </button>
      ) : null}
      {pin.body ? <p className="whitespace-pre-wrap">{pin.body}</p> : null}
    </div>
  );
}

export function ProjectVisionBoard({
  projectId,
  initialPins,
}: {
  projectId: string;
  initialPins: VisionPin[];
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const textFormRef = useRef<HTMLFormElement>(null);
  const imageFormRef = useRef<HTMLFormElement>(null);
  const [pins, setPins] = useState(initialPins);
  const [lightbox, setLightbox] = useState<VisionPin | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setPins(initialPins);
  }, [initialPins]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, delta } = event;
    const board = boardRef.current;
    if (!board) return;
    const pinId = String(active.id);
    const pin = pins.find((p) => p.id === pinId);
    if (!pin) return;

    const rect = board.getBoundingClientRect();
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

  async function handleAdd(formData: FormData) {
    const created = await addVisionPin(formData);
    setPins((prev) => [...prev, created]);
    const kind = formData.get("kind");
    if (kind === "text") textFormRef.current?.reset();
    if (kind === "image") imageFormRef.current?.reset();
    router.refresh();
  }

  async function handleDelete(formData: FormData) {
    const id = formData.get("id") as string;
    await deleteVisionPin(formData);
    setPins((prev) => prev.filter((pin) => pin.id !== id));
    if (lightbox?.id === id) setLightbox(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <form
          ref={textFormRef}
          action={handleAdd}
          className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="kind" value="text" />
          <input type="hidden" name="xPct" value="12" />
          <input type="hidden" name="yPct" value="12" />
          <Textarea name="body" placeholder={t("visionTextPlaceholder")} required rows={3} />
          <Button type="submit" size="sm">
            {t("addTextPin")}
          </Button>
        </form>
        <form
          ref={imageFormRef}
          action={handleAdd}
          className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
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

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          ref={boardRef}
          className="relative h-[28rem] overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 to-zinc-100 dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-950"
        >
          {pins.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
              {t("emptyVision")}
            </p>
          )}
          {pins.map((pin) => (
            <VisionPinCard key={pin.id} pin={pin} onOpen={setLightbox} />
          ))}
        </div>
      </DndContext>

      <ul className="space-y-2">
        {pins.map((pin) => (
          <li key={pin.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {pin.kind === "text" ? pin.body : pin.body || t("imagePin")}
            </span>
            <ConfirmForm action={handleDelete} message={t("confirmDeletePin")}>
              <input type="hidden" name="id" value={pin.id} />
              <Button type="submit" size="sm" variant="destructive">
                {tc("delete")}
              </Button>
            </ConfirmForm>
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(lightbox)} onOpenChange={(open) => !open && setLightbox(null)}>
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
    </div>
  );
}
