"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  type DragOverEvent,
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
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { useFormError } from "@/components/ui/form-error-context";
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

function isWorkStatus(value: string): value is WorkItemStatus {
  return (WORK_ITEM_STATUSES as readonly string[]).includes(value);
}

function SortableCard({
  item,
  onSave,
  onDeleteSuccess,
}: {
  item: WorkItem;
  onSave: (formData: FormData) => void | Promise<void>;
  onDeleteSuccess: (id: string) => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { type: "item", status: item.status } });
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
      <div
        className="mb-2 flex cursor-grab items-center gap-2 rounded-md border border-zinc-100 bg-zinc-50 px-2 py-2.5 active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-900"
        {...attributes}
        {...listeners}
      >
        <GripVertical
          className="h-4 w-4 shrink-0 text-zinc-400"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {item.title}
        </span>
        <span className="sr-only">{t("dragHandle")}</span>
      </div>
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
      <ConfirmFormAction
        action={deleteWorkItem}
        actionName="deleteWorkItem"
        message={t("confirmDeleteWorkItem")}
        className="mt-2"
        onSuccess={() => onDeleteSuccess(item.id)}
      >
        <input type="hidden" name="id" value={item.id} />
        <Button type="submit" size="sm" variant="destructive">
          {tc("delete")}
        </Button>
      </ConfirmFormAction>
    </div>
  );
}

function Column({
  status,
  items,
  onSave,
  projectId,
  onDeleteSuccess,
}: {
  status: WorkItemStatus;
  items: WorkItem[];
  onSave: (formData: FormData) => void | Promise<void>;
  projectId: string;
  onDeleteSuccess: (id: string) => void;
}) {
  const t = useTranslations("tasks");
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(status),
    data: { type: "column", status },
  });

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
        <div className="flex min-h-[8rem] flex-col gap-2">
          {items.map((item) => (
            <SortableCard
              key={item.id}
              item={item}
              onSave={onSave}
              onDeleteSuccess={onDeleteSuccess}
            />
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
  const router = useRouter();
  const { handleActionResult } = useFormError();
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const dragSnapshotRef = useRef<WorkItem[] | null>(null);
  itemsRef.current = items;

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

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

  function findContainer(id: string, list: WorkItem[] = items): WorkItemStatus | null {
    const asColumn = parseColumnId(id);
    if (asColumn) return asColumn;
    const item = list.find((row) => row.id === id);
    return item && isWorkStatus(item.status) ? item.status : null;
  }

  function flattenByStatus(
    nextByStatus: Record<WorkItemStatus, WorkItem[]>,
  ): WorkItem[] {
    return WORK_ITEM_STATUSES.flatMap((status) =>
      nextByStatus[status].map((item, order) => ({
        ...item,
        status,
        order,
      })),
    );
  }

  function onDragStart(event: DragStartEvent) {
    dragSnapshotRef.current = [...itemsRef.current];
    setActiveId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeItemId = String(active.id);
    const overId = String(over.id);
    if (activeItemId === overId) return;

    setItems((prev) => {
      const fromStatus = findContainer(activeItemId, prev);
      const toStatus = parseColumnId(overId) ?? findContainer(overId, prev);
      if (!fromStatus || !toStatus) return prev;

      const fromItems = prev
        .filter((i) => i.status === fromStatus)
        .sort((a, b) => a.order - b.order);
      const fromIndex = fromItems.findIndex((i) => i.id === activeItemId);
      if (fromIndex < 0) return prev;

      if (fromStatus === toStatus) {
        if (parseColumnId(overId)) return prev;
        const overIndex = fromItems.findIndex((i) => i.id === overId);
        if (overIndex < 0 || fromIndex === overIndex) return prev;
        const nextByStatus: Record<WorkItemStatus, WorkItem[]> = {
          backlog: prev
            .filter((i) => i.status === "backlog")
            .sort((a, b) => a.order - b.order),
          in_progress: prev
            .filter((i) => i.status === "in_progress")
            .sort((a, b) => a.order - b.order),
          done: prev
            .filter((i) => i.status === "done")
            .sort((a, b) => a.order - b.order),
        };
        nextByStatus[fromStatus] = arrayMove(fromItems, fromIndex, overIndex);
        return flattenByStatus(nextByStatus);
      }

      const toItems = prev
        .filter((i) => i.status === toStatus)
        .sort((a, b) => a.order - b.order);
      const [moved] = fromItems.splice(fromIndex, 1);
      const overIndex = parseColumnId(overId)
        ? toItems.length
        : toItems.findIndex((i) => i.id === overId);
      const insertAt = overIndex < 0 ? toItems.length : overIndex;
      toItems.splice(insertAt, 0, { ...moved, status: toStatus });

      const nextByStatus: Record<WorkItemStatus, WorkItem[]> = {
        backlog: prev
          .filter((i) => i.status === "backlog" && i.id !== activeItemId)
          .sort((a, b) => a.order - b.order),
        in_progress: prev
          .filter((i) => i.status === "in_progress" && i.id !== activeItemId)
          .sort((a, b) => a.order - b.order),
        done: prev
          .filter((i) => i.status === "done" && i.id !== activeItemId)
          .sort((a, b) => a.order - b.order),
      };
      nextByStatus[fromStatus] = fromItems;
      nextByStatus[toStatus] = toItems;
      return flattenByStatus(nextByStatus);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeItemId = String(active.id);
    const next = itemsRef.current;
    const item = next.find((i) => i.id === activeItemId);
    if (!item || !isWorkStatus(item.status)) return;
    const toStatus = item.status;

    const orderedIdsByStatus = {
      backlog: next
        .filter((i) => i.status === "backlog")
        .sort((a, b) => a.order - b.order)
        .map((i) => i.id),
      in_progress: next
        .filter((i) => i.status === "in_progress")
        .sort((a, b) => a.order - b.order)
        .map((i) => i.id),
      done: next
        .filter((i) => i.status === "done")
        .sort((a, b) => a.order - b.order)
        .map((i) => i.id),
    };

    const rollback = dragSnapshotRef.current ?? initialItems;
    dragSnapshotRef.current = null;

    startTransition(async () => {
      const result = await reorderWorkItems({
        projectId,
        itemId: activeItemId,
        toStatus,
        orderedIdsByStatus,
      });
      if (handleActionResult(result, "reorderWorkItems")) {
        setItems(rollback);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  async function handleAdd(formData: FormData) {
    const result = await addWorkItem(formData);
    if (!result.ok) {
      handleActionResult(result, "addWorkItem");
      return;
    }
    const created = result.data!;
    setItems((prev) => [...prev, created]);
    if (titleRef.current) titleRef.current.value = "";
    router.refresh();
  }

  function handleDeleteSuccess(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    router.refresh();
  }

  async function handleSave(formData: FormData) {
    const id = formData.get("id") as string;
    const title = (formData.get("title") as string)?.trim();
    const notes = ((formData.get("notes") as string) || "").trim() || null;
    const result = await updateWorkItem(formData);
    if (handleActionResult(result, "updateWorkItem")) return;
    if (title) {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, title, notes } : item)),
      );
    }
    router.refresh();
  }

  const activeItem = items.find((i) => i.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <form action={handleAdd} className="flex flex-wrap gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="status" value="backlog" />
        <Input
          ref={titleRef}
          name="title"
          placeholder={t("newWorkItem")}
          required
          className="min-w-[12rem] flex-1"
        />
        <Button type="submit" size="sm">
          {t("addWorkItem")}
        </Button>
      </form>
      {pending && <p className="text-xs text-zinc-500">{t("savingBoard")}</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-col gap-3 lg:flex-row">
          {WORK_ITEM_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              items={byStatus[status]}
              onSave={handleSave}
              projectId={projectId}
              onDeleteSuccess={handleDeleteSuccess}
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
