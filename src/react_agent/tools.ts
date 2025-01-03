/**
 * This file defines the tools available to the ReAct agent.
 * Tools are functions that the agent can use to interact with external systems or perform specific tasks.
 */
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { VectorStoreTool } from "./tools/vector_store_tool.js";
import { DocumentProcessor } from "./tools/document_processor.js";

/**
 * Tavily search tool configuration
 * This tool allows the agent to perform web searches using the Tavily API.
 */
const searchTavily = new TavilySearchResults({
  maxResults: 3,
});

/**
 * Vector store tool for storing and retrieving embeddings
 */
const vectorStore = new VectorStoreTool();

/**
 * Document processor for research validation
 */
const documentProcessor = new DocumentProcessor(process.cwd());

/**
 * Export an array of all available tools
 * Add new tools to this array to make them available to the agent
 *
 * Note: You can create custom tools by implementing the Tool interface from @langchain/core/tools
 * and add them to this array.
 * See https://js.langchain.com/docs/how_to/custom_tools/#tool-function for more information.
 */
export const TOOLS = [searchTavily, vectorStore, documentProcessor];
