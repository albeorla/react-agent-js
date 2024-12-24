import { Tool } from "@langchain/core/tools";
import { initializeIndex, upsertVectors, queryVectors } from "../vector_store.js";
import { PineconeRecord } from "@pinecone-database/pinecone";

/**
 * Tool for interacting with the vector store
 */
export class VectorStoreTool extends Tool {
  name = "vector_store";
  description = "Store and retrieve vector embeddings from Pinecone. Input should be a JSON string with 'action' ('upsert' or 'query') and relevant data. Vectors must have dimension 1536 (OpenAI embeddings format).";
  
  private index: any;
  
  constructor() {
    super();
    this.initializeStore();
  }
  
  private async initializeStore() {
    this.index = await initializeIndex();
  }
  
  async _call(input: string): Promise<string> {
    try {
      if (!this.index) {
        await this.initializeStore();
      }
      
      const request = JSON.parse(input);
      
      switch (request.action) {
        case "upsert": {
          const vectors: PineconeRecord[] = request.vectors;
          await upsertVectors(this.index, vectors);
          return `Successfully upserted ${vectors.length} vectors`;
        }
        
        case "query": {
          const { vector, topK = 10, filter } = request;
          const results = await queryVectors(this.index, vector, topK, filter);
          return JSON.stringify(results);
        }
        
        default:
          throw new Error(`Unknown action: ${request.action}`);
      }
    } catch (error: any) {
      return `Error: ${error?.message || 'Unknown error occurred'}`;
    }
  }
} 