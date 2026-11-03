/** JSON shapes shared by route handlers and client components. */

export type Role = "user" | "admin";

export type CellDTO = { position: number; src: string; code: string };

export type SheetDTO = {
  id: string;
  number: number;
  status: "ready" | "printing" | "printed";
  trigger: "auto" | "manual" | "reprint";
  createdAt: string;
  claimedAt: string | null;
  printedAt: string | null;
  /** Station that claimed (and usually printed) the sheet. */
  stationName: string | null;
  /** In "printing" for too long: the station likely crashed mid-print. */
  stuck: boolean;
  cells: CellDTO[];
};

export type PendingOrderDTO = {
  id: string;
  code: string;
  label: string;
  createdAt: string;
  /** Created from this browser's session, so a regular user may cancel it. */
  mine: boolean;
  photos: { id: string; src: string; queued: number }[];
};

export type StationStatusDTO = { name: string; lastSeenAt: string | null; online: boolean };

export type QueueDTO = {
  viewer: { role: Role };
  queuedCount: number;
  /** Queued copies that will form the next sheet, in print order. */
  gathering: CellDTO[];
  pendingOrders: PendingOrderDTO[];
  openSheets: SheetDTO[];
  /** The active station (the one that prints), or null if none is chosen. */
  station: StationStatusDTO | null;
  /** When the auto-flush timer will print the remainder, if enabled. */
  autoFlushAt: string | null;
};

export type HistoryDTO = { viewer: { role: Role }; sheets: SheetDTO[] };

export type SettingsDTO = { autoFlushMinutes: number };

export type StationDTO = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  online: boolean;
  /** The station that prints. Others stand by. */
  active: boolean;
  /** This browser is that station. */
  thisDevice: boolean;
};

export type StationsDTO = { stations: StationDTO[]; thisDeviceStationId: string | null };

/** Reply to a station poll. */
export type StationPollDTO = {
  sheet: SheetDTO | null;
  name: string;
  active: boolean;
  activeStationName: string | null;
};

export type AdminSessionDTO = {
  id: string;
  name: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  /** The device making this request. */
  current: boolean;
};
