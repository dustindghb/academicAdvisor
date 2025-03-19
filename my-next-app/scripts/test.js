// search-bulletins.js
// Script to search for keywords in vectorized bulletin data
const { ChromaClient } = require('chromadb');
const readline = require('readline');

// Configuration
const CHROMA_URL = 'http://192.168.0.105:8000';
const EMBED_API_URL = 'http://192.168.0.105:11434/api/embeddings';
const COLLECTION_NAME = 'scu_bulletins';
const EMBED_MODEL = 'nomic-embed-text:latest';
const MAX_RESULTS = 5; // Number of results to return

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to get embeddings from Ollama
async function getEmbedding(text) {
  try {
    const response = await fetch(EMBED_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Error getting embedding:', error.message);
    throw error;
  }
}

// Function to search for keywords
async function searchBulletins(query) {
  console.log(`Searching for: "${query}"...`);
  
  try {
    // Connect to ChromaDB
    const client = new ChromaClient({ path: CHROMA_URL });
    
    // Get collection
    const collection = await client.getCollection({
      name: COLLECTION_NAME
    });
    
    // Get embedding for query
    console.log('Generating query embedding...');
    const queryEmbedding = await getEmbedding(query);
    
    // Search the collection
    console.log('Searching database...');
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: MAX_RESULTS,
      include: ["metadatas", "documents", "distances"]
    });
    
    // Display results
    console.log('\n===== SEARCH RESULTS =====\n');
    
    if (results.ids[0].length === 0) {
      console.log('No results found.');
      return;
    }
    
    for (let i = 0; i < results.ids[0].length; i++) {
      const id = results.ids[0][i];
      const document = results.documents[0][i];
      const metadata = results.metadatas[0][i];
      const distance = results.distances[0][i];
      const relevanceScore = (1 - distance) * 100; // Convert distance to relevance percentage
      
      console.log(`\n--- Result ${i+1} (${relevanceScore.toFixed(1)}% relevant) ---`);
      console.log(`Source: ${metadata.source}`);
      console.log(`Content: ${document.substring(0, 300)}${document.length > 300 ? '...' : ''}`);
    }
    
    console.log('\n============================');
    
  } catch (error) {
    console.error('Search failed:', error.message);
  }
}

// Interactive search function
async function interactiveSearch() {
  console.log('===== SCU Bulletin Search =====');
  console.log('Type a keyword or phrase to search the SCU bulletins.');
  console.log('Type "exit" or "quit" to end the program.\n');
  
  // Function to ask for input
  function askForQuery() {
    rl.question('Enter search query: ', async (query) => {
      if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }
      
      // Perform search
      await searchBulletins(query);
      
      // Ask for next query
      console.log(); // Empty line for readability
      askForQuery();
    });
  }
  
  // Start the interactive loop
  askForQuery();
}

// Run the interactive search
interactiveSearch().catch(error => {
  console.error('Error:', error.message);
  rl.close();
});