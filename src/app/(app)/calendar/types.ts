/** Calendar view item union (T-139). Server components only — Dates stay Dates. */

export type CalendarDayItem =
  | {
      kind: "native";
      id: string;
      title: string;
      startAt: Date;
      endAt: Date | null;
      allDay: false;
      atHome: boolean;
      description: string | null;
      itemsNeeded: string[];
      guests: string[];
    }
  | {
      kind: "feed";
      id: string;
      title: string;
      startAt: Date;
      endAt: Date | null;
      allDay: boolean;
      description: string | null;
      location: string | null;
      feedName: string;
      feedColor: string;
    }
  | {
      kind: "chore";
      id: string;
      title: string;
      startAt: Date;
      endAt: null;
      allDay: false;
      deadline: Date;
    };
