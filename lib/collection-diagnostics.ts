export interface CollectionReadDiagnostics {
  requests: number;
  listingRequests: number;
  metadataRequests: number;
  memberRequests: number;
  /** Summed request durations, including response bodies; concurrent reads overlap. */
  listingMs: number;
  metadataMs: number;
  memberMs: number;
  collections: number;
  ignoredCollections: number;
  members: number;
  slowest: Array<{
    ratingKey: string;
    title: string;
    durationMs: number;
    metadataMs: number;
    memberMs: number;
    requests: number;
    members: number;
    ignored: boolean;
  }>;
}