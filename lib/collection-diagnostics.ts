export interface CollectionReadDiagnostics {
  requests: number;
  listingRequests: number;
  metadataRequests: number;
  memberRequests: number;
  collections: number;
  ignoredCollections: number;
  members: number;
  slowest: Array<{
    ratingKey: string;
    title: string;
    durationMs: number;
    requests: number;
    members: number;
    ignored: boolean;
  }>;
}