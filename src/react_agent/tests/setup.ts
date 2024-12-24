import { jest } from '@jest/globals';
import { mockVectorStore } from './__mocks__/pinecone.js';
import { TavilySearchResults } from './__mocks__/tavily.js';

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  console.log('[SETUP] Cleared all mocks');
});

// Ensure mocks are hoisted before any imports
console.log('[SETUP] Configuring Tavily mock');
jest.mock('@langchain/community/tools/tavily_search', () => {
  console.log('[SETUP] Mock factory called for Tavily');
  return {
    TavilySearchResults
  };
});

// Mock our local vector store
console.log('[SETUP] Configuring vector store mock');
jest.mock('../vector_store.js', () => {
  console.log('[SETUP] Mock factory called for vector store');
  return mockVectorStore;
}); 