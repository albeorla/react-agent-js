import { jest } from '@jest/globals';
import type { PineconeRecord, QueryResponse, RecordMetadata } from '@pinecone-database/pinecone';

// Mock responses that match actual service behavior
export const mockQueryResponse: QueryResponse<RecordMetadata> = {
  matches: [],
  namespace: '',
};

export const mockUpsertResponse = {
  upsertedCount: 1,
};

// Mock functions with logging for debugging
const mockUpsert = jest.fn(
  async (data: PineconeRecord<RecordMetadata>[]) => {
    return { upsertedCount: data.length };
  }
);

const mockQuery = jest.fn().mockImplementation(async (options: any) => {
  console.log('Mock Pinecone query called with:', options);
  return mockQueryResponse;
});

// Mock index that matches the actual Pinecone Index interface
export const mockPineconeIndex = {
  upsert: mockUpsert,
  query: mockQuery,
} as any;

// Mock vector store module
export const mockVectorStore = {
  initializeIndex: jest.fn().mockImplementation(async () => {
    console.log('Mock Pinecone index initialized');
    return mockPineconeIndex;
  }),
  upsertVectors: jest.fn(
    async (index: any, vectors: { vectors: PineconeRecord<RecordMetadata>[] }) => {
      return { upsertedCount: vectors.vectors.length };
    },
  ),
};

export const PineconeStore = {
  fromExistingIndex: jest.fn(),
  fromDocuments: jest.fn(),
};

const mockCreateIndex = jest.fn();
const mockDelete1 = jest.fn();
const mockFetch = jest.fn();
const mockUpdate = jest.fn();
const mockDelete2 = jest.fn();
const mockListIndexes = jest.fn();

export const PineconeClient = jest.fn().mockImplementation(() => {
  return {
    index: jest.fn().mockImplementation(() => {
      return {
        upsert: mockUpsert,
        delete1: mockDelete1,
        fetch: mockFetch,
        query: mockQuery,
        update: mockUpdate,
        delete: mockDelete2,
      };
    }),
    listIndexes: mockListIndexes,
  };
});

export const Pinecone = {
  Index: mockCreateIndex,
  Client: PineconeClient,
};

export const initializeIndex = jest.fn();
export const upsertVectors = mockUpsert; 