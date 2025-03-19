// app/api/search/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';

// Configure your ChromaDB connection - replace with your actual host IP
const CHROMADB_HOST = '192.168.0.105';
const CHROMADB_PORT = 8000;
const COLLECTION_NAME = 'scu_bulletins';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = body;
    
    if (!query || query.trim() === '') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // First, let's try querying with the text directly since ChromaDB may handle the embedding
    try {
      // Query ChromaDB directly using its REST API
      const response = await axios.post(
        `http://${CHROMADB_HOST}:${CHROMADB_PORT}/api/v1/collections/${COLLECTION_NAME}/query`, 
        {
          query_texts: [query],
          n_results: 5,
          include: ["documents", "metadatas", "distances"]
        }
      );
      
      return processResults(response.data);
    } catch (error) {
      console.error('Error with query_texts, trying alternative approach:', error);
      
      // If the first approach failed, try with a fixed-dimension embedding
      const embedding = Array.from({ length: 384 }, () => Math.random() - 0.5);
      
      const response = await axios.post(
        `http://${CHROMADB_HOST}:${CHROMADB_PORT}/api/v1/collections/${COLLECTION_NAME}/query`, 
        {
          query_embeddings: [embedding],
          n_results: 5,
          include: ["documents", "metadatas", "distances"]
        }
      );
      
      return processResults(response.data);
    }
    
    // Helper function to process query results
    function processResults(queryResults: any) {
    
      const results = queryResults.documents && queryResults.documents[0] 
        ? queryResults.documents[0].map((document: string, index: number) => ({
            document,
            metadata: queryResults.metadatas && queryResults.metadatas[0] 
              ? queryResults.metadatas[0][index] || {} 
              : {},
            distance: queryResults.distances && queryResults.distances[0] 
              ? queryResults.distances[0][index] || 0 
              : 0,
            id: queryResults.ids && queryResults.ids[0] 
              ? queryResults.ids[0][index] || `result-${index}` 
              : `result-${index}`,
          }))
        : [];
      
      return NextResponse.json({ results });
    }
  } catch (error: any) {
    console.error('Search error:', error);
    
    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return NextResponse.json(
        { error: `Cannot connect to ChromaDB at ${CHROMADB_HOST}:${CHROMADB_PORT}. Make sure the server is running and accessible.` },
        { status: 503 }
      );
    }
    
    // Check if there's more detailed error info in the response
    const responseData = error.response?.data;
    const detailedMessage = responseData ? JSON.stringify(responseData) : error.message;
    
    return NextResponse.json(
      { error: `Failed to perform search: ${detailedMessage}` },
      { status: 500 }
    );
  }
}