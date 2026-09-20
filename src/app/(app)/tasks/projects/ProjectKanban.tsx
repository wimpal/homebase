"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmForm } from "@/components/ui/confirm-form";
import {
  addWorkItem,
  deleteWorkItem,
  reorderWorkItems,
  updateWorkItem,
} from "@/modules/tasks/actions";
import {
  WORK_ITEM_STATUSES,
  type WorkItemStatus,
} from "@/domain/tasks/projectConstants";

export type WorkItem = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  order: number;
};

function columnId(status: WorkItemStatus) {
  return `column:${status}`;
}

function parseColumnId(id: string): WorkItemStatus | null {
  if (!id.startsWith("column:")) return null;
  const status = id.slice("column:".length);
  return (WORK_ITEM_STATUSES as readonly string[]).includes(status)
    ? (status as WorkItemStatus)
    : null;
}

function SortableCard({
  item,
  onSave,
}: {
  item: WorkItem;
  onSave: (formData: FormData) => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <button
        type="button"
        className="mb-2 cursor-grab text-xs text-zinc-400 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        {t("dragHandle")}
      </button>
      <form action={onSave} className="space-y-2">
        <input type="hidden" name="id" value={item.id} />
        <Input name="title" defaultValue={item.title} required />
        <Textarea
          name="notes"
          defaultValue={item.notes ?? ""}
          placeholder={t("workItemNotes")}
          rows={2}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="outline">
            {tc("save")}
          </Button>
        </div>
      </form>
      <ConfirmForm action={deleteWorkItem} message={t("confirmDeleteWorkItem")} className="mt-2">
        <input type="hidden" name="id" value={item.id} />
        <Button type="submit" size="sm" variant="destructive">
          {tc("delete")}
        </Button>
      </ConfirmForm>
    </div>
  );
}

function Column({
  status,
  items,
  onSave,
}: {
  status: WorkItemStatus;
  items: WorkItem[];
  onSave: (formData: FormData) => void;
}) {
  const t = useTranslations("tasks");
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[16rem] flex-1 flex-col gap-2 rounded-lg border p-3 ${
        isOver
          ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <h3 className="text-sm font-semibold">
        {t(`workStatus_${status}`)} ({items.length})
      </h3>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <SortableCard key={item.id} item={item} onSave={onSave} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function ProjectKanban({
  projectId,
  initialItems,
}: {
  projectId: string;
  initialItems: WorkItem[];
}) {
  const t = useTranslations("tasks");
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byStatus = useMemo(() => {
    const map: Record<WorkItemStatus, WorkItem[]> = {
      backlog: [],
      in_progress: [],
      done: [],
    };
    for (const item of items) {
      const status = isWorkStatus(item.status) ? item.status : "backlog";
      map[status].push(item);
    }
    for (const status of WORK_ITEM_STATUSES) {
      map[status].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [items]);

  function isWorkStatus(value: string): value is WorkItemStatus {
    return (WORK_ITEM_STATUSES as readonly string[]).includes(value);
  }

  function findContainer(id: string): WorkItemStatus | null {
    const asColumn = parseColumnId(id);
    if (asColumn) return asColumn;
    const item = items.find((row) => row.id === id);
    return item && isWorkStatus(item.status) ? item.status : null;
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeItemId = String(active.id);
    const fromStatus = findContainer(activeItemId);
    const toStatus =
      parseColumnId(String(over.id)) ?? findContainer(String(over.id));
    if (!fromStatus || !toStatus) return;

    const fromItems = [...byStatus[fromStatus]];
    const toItems =
      fromStatus === toStatus ? fromItems : [...byStatus[toStatus]];
    const fromIndex = fromItems.findIndex((i) => i.id === activeItemId);
    if (fromIndex < 0) return;

    const overIndex = parseColumnId(String(over.id))
      ? toItems.length
      : toItems.findIndex((i) => i.id === String(over.id));

    const nextByStatus: Record<WorkItemStatus, WorkItem[]> = {
      backlog: [...byStatus.backlog],
      in_progress: [...byStatus.in_progress],
      done: [...byStatus.done],
    };

    if (fromStatus === toStatus) {
      nextByStatus[fromStatus] = arrayMove(
        fromItems,
        fromIndex,
        overIndex < 0 ? fromItems.length - 1 : overIndex,
      ).map((item, order) => ({ ...item, order, status: fromStatus }));
    } else {
      const [moved] = fromItems.splice(fromIndex, 1);
      const insertAt = overIndex < 0 ? toItems.length : overIndex;
      toItems.splice(insertAt, 0, { ...moved, status: toStatus });
      nextByStatus[fromStatus] = fromItems.map((item, order) => ({
        ...item,
        order,
        status: fromStatus,
      }));
      nextByStatus[toStatus] = toItems.map((item, order) => ({
        ...item,
        order,
        status: toStatus,
      }));
    }

    const flat = WORK_ITEM_STATUSES.flatMap((status) => nextByStatus[status]);
    setItems(flat);

    const orderedIdsByStatus = {
      backlog: nextByStatus.backlog.map((i) => i.id),
      in_progress: nextByStatus.in_progress.map((i) => i.id),
      done: nextByStatus.done.map((i) => i.id),
    };

    startTransition(async () => {
      await reorderWorkItems({
        projectId,
        itemId: activeItemId,
        toStatus,
        orderedIdsByStatus,
      });
    });
  }

  const activeItem = items.find((i) => i.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <form action={addWorkItem} className="flex flex-wrap gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="status" value="backlog" />
        <Input name="title" placeholder={t("newWorkItem")} required className="min-w-[12rem] flex-1" />
        <Button type="submit" size="sm">
          {t("addWorkItem")}
        </Button>
      </form>
      {pending && <p className="text-xs text-zinc-500">{t("savingBoard")}</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-col gap-3 lg:flex-row">
          {WORK_ITEM_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              items={byStatus[status]}
              onSave={updateWorkItem}
            />
          ))}
        </div>
        <DragOverlay>
          {activeItem ? (
            <div className="rounded-md border border-emerald-400 bg-white p-3 shadow-lg dark:bg-zinc-950">
              {activeItem.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
