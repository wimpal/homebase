export interface JellyfinUserData {
  Played?: boolean;
  PlaybackPositionTicks?: number;
  LastPlayedDate?: string;
  IsFavorite?: boolean;
  [key: string]: unknown;
}

export interface JellyfinItem {
  Id?: string;
  Name?: string;
  Type?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  SeriesId?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  UserData?: JellyfinUserData;
  [key: string]: unknown;
}

export interface JellyfinSession {
  Id?: string;
  Client?: string;
  SupportsRemoteControl?: boolean;
  [key: string]: unknown;
}
