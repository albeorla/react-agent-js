import { jest } from '@jest/globals';
import { Tool } from "@langchain/core/tools";

export interface TavilySearchResult {
  url: string;
  title: string;
  content: string;
  snippet: string;
  published_date: string;
}

export const CLIMATE_CHANGE_RESULT: TavilySearchResult = {
  url: 'https://climate.nasa.gov/evidence/',
  title: 'Climate Change Evidence',
  content: 'Scientific evidence shows climate change is causing global temperatures to rise. Multiple studies published in peer-reviewed scientific journals show that climate change is real.',
  snippet: 'Multiple studies published in peer-reviewed scientific journals show that climate change is real.',
  published_date: '2024-01-01'
};

export const FLAT_EARTH_RESULT: TavilySearchResult = {
  url: 'https://science.nasa.gov/earth/facts',
  title: 'Earth Facts - Debunking Flat Earth',
  content: 'The Earth is not flat. This myth has been thoroughly debunked by scientific evidence. The Earth is an oblate spheroid.',
  snippet: 'This myth has been debunked. Scientific evidence clearly shows the Earth is spherical, not flat.',
  published_date: '2024-01-01'
};

interface TavilyOptions {
  maxResults?: number;
  [key: string]: any;
}

// Create a mock class that matches the real TavilySearchResults
export class TavilySearchResults extends Tool {
  name = "tavily_search";
  description = "Search the web using Tavily API";
  private options: TavilyOptions;

  constructor(options?: TavilyOptions) {
    super();
    this.options = options || { maxResults: 3 };
  }

  async _call(query: string): Promise<string> {
    console.log('[MOCK] Tavily search called with query:', query);
    
    let result: TavilySearchResult[];
    if (query.toLowerCase().includes('climate change')) {
      console.log('[MOCK] Returning climate change result');
      result = [CLIMATE_CHANGE_RESULT];
    } else if (query.toLowerCase().includes('earth is flat')) {
      console.log('[MOCK] Returning flat earth result');
      result = [FLAT_EARTH_RESULT];
    } else {
      console.log('[MOCK] No matching results, returning empty array');
      result = [];
    }

    return JSON.stringify(result);
  }
}

// Export the mock class with the constructor spy
export const mockTavilySearch = jest.fn((options?: any) => {
  console.log('[MOCK] Creating new TavilySearchResults instance');
  return new TavilySearchResults(options);
}); 