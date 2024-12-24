import { Pinecone, PineconeRecord, Index, QueryOptions } from '@pinecone-database/pinecone';
import { config } from 'dotenv';

// Load environment variables
config();

const {
  PINECONE_API_KEY,
  PINECONE_ENVIRONMENT,
  PINECONE_INDEX
} = process.env;

if (!PINECONE_API_KEY || !PINECONE_ENVIRONMENT || !PINECONE_INDEX) {
  throw new Error('Missing Pinecone environment variables');
}

/**
 * Initialize Pinecone client with environment variables
 */
export const pinecone = new Pinecone({
  apiKey: PINECONE_API_KEY
});

/**
 * Initialize or get the Pinecone index
 * @param dimension - Vector dimension (e.g. 1536 for OpenAI, 768 for other models)
 * @returns The Pinecone index
 */
export async function initializeIndex(dimension: number = 1536): Promise<Index> {
  if (!PINECONE_INDEX) {
    throw new Error('PINECONE_INDEX environment variable is required');
  }
  
  const indexName = PINECONE_INDEX;
  
  // List existing indexes
  const existingIndexes = await pinecone.listIndexes();
  
  // Create index if it doesn't exist
  const indexExists = existingIndexes.indexes?.some(
    (idx: { name: string }) => idx.name === indexName
  ) ?? false;
  
  if (!indexExists) {
    console.log(`Creating new Pinecone index: ${indexName}`);
    await pinecone.createIndex({
      name: indexName,
      dimension,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    });
    
    // Wait for index to be ready
    await new Promise(resolve => setTimeout(resolve, 60000));
  }

  return pinecone.index(indexName);
}

/**
 * Utility function to upsert vectors to Pinecone
 * @param index - Pinecone index instance
 * @param vectors - Array of vectors to upsert
 */
export async function upsertVectors(
  index: Index,
  vectors: PineconeRecord[]
) {
  return await index.upsert(vectors);
}

/**
 * Utility function to query vectors from Pinecone
 * @param index - Pinecone index instance
 * @param vector - Query vector
 * @param topK - Number of results to return
 * @param filter - Optional metadata filter
 */
export async function queryVectors(
  index: Index,
  vector: number[],
  topK: number = 10,
  filter?: object
) {
  const queryOptions: QueryOptions = {
    vector,
    topK,
    includeMetadata: true
  };

  if (filter) {
    queryOptions.filter = filter;
  }

  return await index.query(queryOptions);
} 